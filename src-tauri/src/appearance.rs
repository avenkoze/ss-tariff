use std::fs::{self, File};
use std::io::BufWriter;
use std::path::Path;

use anyhow::{bail, Context, Result};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::GenericImageView;

use crate::models::PreparedBackground;

const MAX_SOURCE_BYTES: u64 = 50 * 1024 * 1024;

pub fn prepare_custom_background(
    source: &Path,
    appearance_dir: &Path,
) -> Result<PreparedBackground> {
    let metadata = fs::metadata(source)
        .with_context(|| format!("Arka plan dosyası okunamadı: {}", source.display()))?;
    if !metadata.is_file() {
        bail!("Seçilen arka plan bir dosya değil.");
    }
    if metadata.len() > MAX_SOURCE_BYTES {
        bail!("Arka plan dosyası 50 MB'den küçük olmalı.");
    }

    let bytes = fs::read(source)
        .with_context(|| format!("Arka plan dosyası okunamadı: {}", source.display()))?;
    let decoded = image::load_from_memory(&bytes).context("Arka plan görseli çözülemedi.")?;
    let (width, height) = decoded.dimensions();
    if width < 640 || height < 360 {
        bail!("Arka plan en az 640 × 360 piksel olmalı.");
    }

    let prepared = decoded.thumbnail(2560, 1600).to_rgb8();
    let sample = image::DynamicImage::ImageRgb8(prepared.clone())
        .resize_exact(32, 32, FilterType::Triangle)
        .to_rgb8();
    let luminance = sample
        .pixels()
        .map(|pixel| {
            let [red, green, blue] = pixel.0;
            (red as f64 * 0.2126 + green as f64 * 0.7152 + blue as f64 * 0.0722) / 255.0
        })
        .sum::<f64>()
        / (sample.width() * sample.height()) as f64;

    fs::create_dir_all(appearance_dir).context("Arka plan klasörü oluşturulamadı.")?;
    let target = appearance_dir.join("custom-background.jpg");
    let temporary = appearance_dir.join("custom-background.next.jpg");
    let output = File::create(&temporary).context("Arka plan kopyası oluşturulamadı.")?;
    let mut writer = BufWriter::new(output);
    JpegEncoder::new_with_quality(&mut writer, 88)
        .encode_image(&prepared)
        .context("Arka plan kopyası yazılamadı.")?;
    drop(writer);

    if target.exists() {
        fs::remove_file(&target).context("Eski arka plan değiştirilemedi.")?;
    }
    fs::rename(&temporary, &target).context("Arka plan etkinleştirilemedi.")?;

    Ok(PreparedBackground {
        path: target.to_string_lossy().into_owned(),
        luminance,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};

    #[test]
    fn prepares_a_bounded_local_copy_without_touching_the_source() {
        let root =
            std::env::temp_dir().join(format!("ss-tariff-appearance-{}", uuid::Uuid::new_v4()));
        let source = root.join("source.png");
        let destination = root.join("appearance");
        fs::create_dir_all(&root).unwrap();
        ImageBuffer::from_pixel(800, 450, Rgb([180_u8, 120_u8, 60_u8]))
            .save(&source)
            .unwrap();

        let prepared = prepare_custom_background(&source, &destination).unwrap();

        assert!(source.exists());
        assert!(std::path::PathBuf::from(&prepared.path).exists());
        assert!((0.45..0.6).contains(&prepared.luminance));
        fs::remove_dir_all(root).unwrap();
    }
}
