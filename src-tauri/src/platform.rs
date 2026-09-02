use anyhow::{bail, Context, Result};

#[cfg(windows)]
pub fn sync_launch_at_login(enabled: bool) -> Result<()> {
    use std::process::Command;

    const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    const VALUE_NAME: &str = "SSTariff";
    let status = if enabled {
        let executable = std::env::current_exe().context("Uygulama yolu bulunamadı")?;
        let command = format!("\"{}\" --hidden", executable.display());
        Command::new("reg.exe")
            .args([
                "add", RUN_KEY, "/v", VALUE_NAME, "/t", "REG_SZ", "/d", &command, "/f",
            ])
            .status()
            .context("Windows başlangıç ayarı yazılamadı")?
    } else {
        let status = Command::new("reg.exe")
            .args(["delete", RUN_KEY, "/v", VALUE_NAME, "/f"])
            .status()
            .context("Windows başlangıç ayarı kaldırılamadı")?;
        if status.success() || status.code() == Some(1) {
            return Ok(());
        }
        status
    };
    if !status.success() {
        bail!("Windows başlangıç ayarı güncellenemedi");
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn sync_launch_at_login(_enabled: bool) -> Result<()> {
    Ok(())
}
