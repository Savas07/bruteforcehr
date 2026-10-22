fn main() {
    // Declaring the app's commands makes Tauri generate one `allow-<command>` permission per
    // command; a command is only callable from windows whose capability grants it.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["open_external", "open_job_url"]),
    ))
    .expect("failed to run tauri-build");
}
