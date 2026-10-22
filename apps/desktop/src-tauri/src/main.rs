// Release builds on Windows are GUI apps: no console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod external_url;
mod menu;
mod navigation;
mod window;

fn main() {
    let builder = tauri::Builder::default().plugin(
        // Used from Rust only (commands::open_external); its JS commands are not granted, and it
        // must not install its click handler that routes <a> clicks to the system browser.
        tauri_plugin_opener::Builder::new()
            .open_js_links_on_click(false)
            .build(),
    );

    // Test builds only (`pnpm build:e2e`): WebdriverIO bridge and the embedded WebDriver server.
    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .invoke_handler(tauri::generate_handler![commands::open_external])
        .menu(menu::build)
        .on_menu_event(|app, event| menu::handle_event(app, &event))
        .setup(|app| {
            window::create_main(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BruteForceHR");
}
