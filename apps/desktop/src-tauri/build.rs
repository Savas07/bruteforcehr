fn main() {
    // Declaring the app's commands makes Tauri generate one `allow-<command>` permission per
    // command; a command is only callable from windows whose capability grants it.
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(&[
            "open_external",
            "open_job_url",
            "update_status",
            "check_for_updates",
            "restart_to_update",
            "set_update_channel",
            "take_auth_link",
            "take_mail_connect",
            "set_signed_in",
            "open_mail_inbox",
            "open_mailto",
            "print_cv_pdf",
            "save_export",
            "save_kit_file",
            "open_kit_file",
            "reveal_kit_file",
        ]))
        // tauri-build would put the Windows application manifest into the app's resources,
        // which only the `bruteforcehr` binary links; the linker embeds it below instead.
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    embed_windows_manifest();
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}

/// Embeds `windows-app-manifest.xml` (Common Controls v6) into every Windows executable this
/// package links, test binaries included: without it, `tests/print_pdf.rs`, which starts a Tauri
/// app, fails to load (`STATUS_ENTRYPOINT_NOT_FOUND`).
fn embed_windows_manifest() {
    println!("cargo:rerun-if-changed=windows-app-manifest.xml");
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "msvc" {
        return;
    }
    let manifest =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}
