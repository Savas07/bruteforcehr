// Release builds on Windows are GUI apps: no console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod external_url;
mod job_url;
mod menu;
mod navigation;
mod preferences;
mod updater;
mod window;

fn main() {
    let builder = tauri::Builder::default()
        .plugin(
            // Used from Rust only (commands::open_external, open_job_url); its JS commands are not granted, and it
            // must not install its click handler that routes <a> clicks to the system browser.
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        // Driven from Rust only (src/updater.rs); none of its JS commands are granted.
        .plugin(tauri_plugin_updater::Builder::new().build());

    // Test builds only (`pnpm build:e2e`): WebdriverIO bridge and the embedded WebDriver server.
    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .manage(job_url::RateLimiter::for_job_urls())
        .manage(updater::Updates::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_external,
            commands::open_job_url,
            commands::update_status,
            commands::check_for_updates,
            commands::restart_to_update,
            commands::set_update_channel
        ])
        .menu(menu::build)
        .on_menu_event(|app, event| menu::handle_event(app, &event))
        .setup(|app| {
            window::create_main(app.handle())?;
            updater::start_background_checks(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building BruteForceHR")
        .run(|app, event| {
            // A downloaded update installs at quit, so the next launch runs it (BRIEF §7).
            if let tauri::RunEvent::Exit = event {
                updater::install_on_exit(app);
            }
        });
}
