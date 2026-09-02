use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat};
use sha2::{Digest, Sha256};

use crate::models::{NativeAnalysis, VisualFingerprint};

pub const ANALYSIS_VERSION: u32 = 2;
pub const EMBEDDING_DIMENSIONS: usize = 128;
pub const EMBEDDING_MODEL_VERSION: &str = "feature-hash-v2";

const CATEGORY_KEYWORDS: &[(&str, &[&str])] = &[
    (
        "shopping",
        &[
            "ayakkabı",
            "shoe",
            "ürün",
            "product",
            "sepet",
            "sipariş",
            "fiyat",
            "tl",
            "₺",
            "order",
            "kargo",
        ],
    ),
    (
        "food",
        &[
            "tarif", "recipe", "malzeme", "yemek", "makarna", "kahve", "pişir", "gram", "kişilik",
        ],
    ),
    (
        "places",
        &[
            "mekan",
            "konum",
            "harita",
            "map",
            "adres",
            "kadıköy",
            "istanbul",
            "otel",
            "restaurant",
            "km",
        ],
    ),
    (
        "chats",
        &[
            "whatsapp",
            "mesaj",
            "message",
            "sohbet",
            "chat",
            "annem",
            "gönderildi",
            "çevrimiçi",
        ],
    ),
    (
        "ideas",
        &[
            "fikir", "idea", "not", "note", "oku", "kitap", "liste", "hatırla", "taslak",
        ],
    ),
    (
        "documents",
        &[
            "bilet",
            "ticket",
            "boarding",
            "qr",
            "fatura",
            "fiş",
            "receipt",
            "toplam",
            "rezervasyon",
            "pdf",
        ],
    ),
    (
        "social",
        &[
            "instagram",
            "twitter",
            "tiktok",
            "post",
            "tweet",
            "beğeni",
            "takipçi",
            "saved",
        ],
    ),
];

const SEMANTIC_ALIASES: &[(&str, &[&str])] = &[
    ("ayakkabı", &["shoe", "sneaker", "spor", "giyim"]),
    ("siyah", &["black", "dark", "koyu"]),
    ("mekan", &["yer", "restaurant", "kafe", "cafe", "konum"]),
    ("tarif", &["recipe", "yemek", "pişirme", "malzeme"]),
    ("bilet", &["ticket", "uçuş", "boarding", "etkinlik"]),
    ("fikir", &["idea", "not", "taslak", "proje"]),
    (
        "alışveriş",
        &["ürün", "product", "sipariş", "fiyat", "sepet"],
    ),
];

pub fn analyze_image(path: &Path, thumbnail_dir: &Path) -> Result<NativeAnalysis> {
    let bytes = fs::read(path).with_context(|| format!("Dosya okunamadı: {}", path.display()))?;
    let content_hash = hex::encode(Sha256::digest(&bytes));
    let image = image::load_from_memory(&bytes)
        .with_context(|| format!("Görsel çözülemedi: {}", path.display()))?;
    let (width, height) = image.dimensions();
    let (fingerprint, perceptual_hash, average_color, average_rgb) = inspect_visual(&image);
    let junk_signals = detect_junk(&fingerprint);
    let ocr_text = extract_ocr_text(path).unwrap_or_default();
    let file_text = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .replace(['_', '-', '.'], " ");
    let combined_text = format!("{file_text} {ocr_text}").trim().to_string();
    let (mut category, mut confidence, mut tags) = classify(&combined_text);
    tags.extend(visual_tags(&fingerprint, average_rgb, width, height));
    if !junk_signals.is_empty() {
        category = "junk".into();
        confidence = 0.98;
    }

    fs::create_dir_all(thumbnail_dir)?;
    let thumbnail_path = thumbnail_dir.join(format!("{}.jpg", &content_hash[..24]));
    if !thumbnail_path.exists() {
        let thumbnail = image.thumbnail(420, 720);
        thumbnail
            .save_with_format(&thumbnail_path, ImageFormat::Jpeg)
            .with_context(|| format!("Thumbnail yazılamadı: {}", thumbnail_path.display()))?;
    }

    let sensitivity = if category == "chats" || category == "documents" {
        "sensitive"
    } else {
        "normal"
    };
    let embedding = embed_text(&format!("{category} {} {combined_text}", tags.join(" ")));

    Ok(NativeAnalysis {
        category,
        confidence,
        tags,
        extracted_text: ocr_text,
        width,
        height,
        content_hash,
        perceptual_hash,
        average_color,
        visual_fingerprint: fingerprint,
        junk_signals,
        sensitivity: sensitivity.into(),
        thumbnail_path: thumbnail_path.to_string_lossy().into_owned(),
        embedding,
        ocr_engine: if cfg!(windows) {
            "windows-media-ocr"
        } else {
            "metadata-fallback"
        }
        .into(),
    })
}

fn inspect_visual(image: &DynamicImage) -> (VisualFingerprint, String, String, [u8; 3]) {
    let sample = image.resize_exact(16, 16, FilterType::Triangle).to_rgb8();
    let mut luminances = Vec::with_capacity(256);
    let mut red = 0_u64;
    let mut green = 0_u64;
    let mut blue = 0_u64;

    for pixel in sample.pixels() {
        let [r, g, b] = pixel.0;
        red += r as u64;
        green += g as u64;
        blue += b as u64;
        luminances.push(r as f64 * 0.299 + g as f64 * 0.587 + b as f64 * 0.114);
    }

    let count = luminances.len() as f64;
    let mean = luminances.iter().sum::<f64>() / count;
    let variance = luminances
        .iter()
        .map(|value| (value - mean).powi(2))
        .sum::<f64>()
        / count;
    let hash = luminances
        .iter()
        .map(|value| if *value >= mean { '1' } else { '0' })
        .collect();
    let fingerprint = VisualFingerprint {
        mean_luminance: mean,
        luminance_deviation: variance.sqrt(),
        dark_pixel_ratio: luminances.iter().filter(|value| **value <= 12.0).count() as f64 / count,
        bright_pixel_ratio: luminances.iter().filter(|value| **value >= 245.0).count() as f64
            / count,
    };
    let average_rgb = [
        (red / luminances.len() as u64) as u8,
        (green / luminances.len() as u64) as u8,
        (blue / luminances.len() as u64) as u8,
    ];
    let average_color = format!(
        "rgb({}, {}, {})",
        average_rgb[0], average_rgb[1], average_rgb[2]
    );
    (fingerprint, hash, average_color, average_rgb)
}

fn visual_tags(
    fingerprint: &VisualFingerprint,
    [red, green, blue]: [u8; 3],
    width: u32,
    height: u32,
) -> Vec<String> {
    let mut tags = Vec::with_capacity(3);
    tags.push(
        if width > height {
            "yatay"
        } else if height > width {
            "dikey"
        } else {
            "kare"
        }
        .into(),
    );

    if fingerprint.mean_luminance <= 68.0 {
        tags.push("koyu".into());
    } else if fingerprint.mean_luminance >= 188.0 {
        tags.push("açık".into());
    }

    let max = red.max(green).max(blue);
    let min = red.min(green).min(blue);
    if max.saturating_sub(min) <= 18 {
        tags.push(
            if max <= 72 {
                "siyah"
            } else if min >= 190 {
                "beyaz"
            } else {
                "gri"
            }
            .into(),
        );
    } else if red == max {
        tags.push("kırmızı".into());
    } else if green == max {
        tags.push("yeşil".into());
    } else {
        tags.push("mavi".into());
    }
    tags
}

fn detect_junk(fingerprint: &VisualFingerprint) -> Vec<String> {
    let mut signals = Vec::new();
    if fingerprint.dark_pixel_ratio >= 0.96 && fingerprint.luminance_deviation <= 8.0 {
        signals.push("near-black".into());
    }
    if fingerprint.bright_pixel_ratio >= 0.96 && fingerprint.luminance_deviation <= 8.0 {
        signals.push("near-white".into());
    }
    if fingerprint.luminance_deviation <= 2.4 {
        signals.push("uniform-frame".into());
    }
    signals
}

fn classify(text: &str) -> (String, f64, Vec<String>) {
    let normalized = text.to_lowercase();
    let mut best_category = "other";
    let mut best_hits = Vec::new();

    for (category, words) in CATEGORY_KEYWORDS {
        let hits: Vec<String> = words
            .iter()
            .filter(|word| normalized.contains(**word))
            .map(|word| (*word).to_string())
            .collect();
        if hits.len() > best_hits.len() {
            best_category = category;
            best_hits = hits;
        }
    }

    let confidence = if best_hits.is_empty() {
        0.51
    } else {
        (0.68 + best_hits.len() as f64 * 0.08).min(0.96)
    };
    (
        best_category.into(),
        confidence,
        best_hits.into_iter().take(6).collect(),
    )
}

pub fn embed_text(text: &str) -> Vec<f32> {
    let mut vector = vec![0.0_f32; EMBEDDING_DIMENSIONS];
    let normalized = text.to_lowercase();
    let mut tokens: BTreeSet<String> = normalized
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| token.chars().count() > 1)
        .map(str::to_string)
        .collect();

    for (root, aliases) in SEMANTIC_ALIASES {
        if tokens.contains(*root) || aliases.iter().any(|alias| tokens.contains(*alias)) {
            tokens.insert((*root).into());
            tokens.extend(aliases.iter().map(|alias| (*alias).to_string()));
        }
    }

    for token in tokens {
        let digest = Sha256::digest(token.as_bytes());
        let index = u16::from_le_bytes([digest[0], digest[1]]) as usize % EMBEDDING_DIMENSIONS;
        let sign = if digest[2] & 1 == 0 { 1.0 } else { -1.0 };
        vector[index] += sign;

        let characters: Vec<char> = token.chars().collect();
        for trigram in characters.windows(3) {
            let feature = format!("g:{}{}{}", trigram[0], trigram[1], trigram[2]);
            let digest = Sha256::digest(feature.as_bytes());
            let index = u16::from_le_bytes([digest[0], digest[1]]) as usize % EMBEDDING_DIMENSIONS;
            let sign = if digest[2] & 1 == 0 { 1.0 } else { -1.0 };
            vector[index] += sign * 0.35;
        }
    }
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm > 0.0 {
        for value in &mut vector {
            *value /= norm;
        }
    }
    vector
}

pub fn cosine_similarity(first: &[f32], second: &[f32]) -> f32 {
    if first.len() != second.len() || first.is_empty() {
        return 0.0;
    }
    first.iter().zip(second).map(|(a, b)| a * b).sum()
}

#[cfg(windows)]
fn extract_ocr_text(path: &Path) -> Result<String> {
    use windows::core::HSTRING;
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::{FileAccessMode, StorageFile};

    let path = HSTRING::from(path.to_string_lossy().as_ref());
    let file = StorageFile::GetFileFromPathAsync(&path)?.get()?;
    let stream = file.OpenAsync(FileAccessMode::Read)?.get()?;
    let decoder = BitmapDecoder::CreateAsync(&stream)?.get()?;
    let bitmap = decoder.GetSoftwareBitmapAsync()?.get()?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()?;
    let result = engine.RecognizeAsync(&bitmap)?.get()?;
    Ok(result.Text()?.to_string())
}

#[cfg(not(windows))]
fn extract_ocr_text(_path: &Path) -> Result<String> {
    Ok(String::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semantic_aliases_make_related_queries_close() {
        let query = embed_text("siyah ayakkabı");
        let related = embed_text("black sneaker product");
        let unrelated = embed_text("uçuş bileti qr");
        assert!(cosine_similarity(&query, &related) > cosine_similarity(&query, &unrelated));
    }

    #[test]
    fn empty_embeddings_are_safe() {
        assert_eq!(embed_text(""), vec![0.0; EMBEDDING_DIMENSIONS]);
    }

    #[test]
    fn visual_tags_capture_layout_tone_and_color() {
        let image = DynamicImage::new_rgb8(100, 200);
        let (fingerprint, _, _, average_rgb) = inspect_visual(&image);
        let tags = visual_tags(&fingerprint, average_rgb, 100, 200);

        assert!(tags.iter().any(|tag| tag == "dikey"));
        assert!(tags.iter().any(|tag| tag == "koyu"));
        assert!(tags.iter().any(|tag| tag == "siyah"));
    }
}
