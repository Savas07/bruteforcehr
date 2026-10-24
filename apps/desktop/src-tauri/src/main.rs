// Release builds on Windows are GUI apps: no console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth_link;
mod commands;
mod cv_pdf;
mod export_file;
mod external_url;
mod job_url;
mod mail_connect;
mod mail_inbox;
mod mailto;
mod menu;
mod navigation;
mod preferences;
mod updater;
mod window;

use tauri_plugin_deep_link::DeepLinkExt;

fn main() {
    let builder = tauri::Builder::default()
        // First, so a second launch (Windows: a `bruteforcehr://` link starts one with the link as
        // its argument) hands its link to this instance's deep-link handler and quits.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            auth_link::focus_main(app);
        }))
        // `bruteforcehr://` (plugins.deep-link in tauri.conf.json). Used from Rust only: links reach
        // the UI after `auth_link` / `mail_connect` have checked them; none of the plugin's JS
        // commands are granted.
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            // Used from Rust only (commands::open_external, open_job_url, open_mailto); its JS commands are not granted, and it
            // must not install its click handler that routes <a> clicks to the system browser.
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        // Driven from Rust only (src/updater.rs); none of its JS commands are granted.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // The CV export's Save dialog (src/export_file.rs), driven from Rust only; none of its JS
        // commands are granted.
        .plugin(tauri_plugin_dialog::init())
        // Interview prep reminders (src/lib/notifications.ts): the UI checks and requests the
        // permission and sends notifications; nothing else of the plugin is granted.
        .plugin(tauri_plugin_notification::init());

    // Test builds only (`pnpm build:e2e`): WebdriverIO bridge and the embedded WebDriver server.
    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .manage(job_url::RateLimiter::for_job_urls())
        .manage(mailto::MailtoLimiter::default())
        .manage(updater::Updates::default())
        .manage(auth_link::PendingAuthLink::default())
        .manage(mail_connect::PendingMailConnect::default())
        // CV pages for the hidden print windows (src/cv_pdf.rs).
        .manage(cv_pdf::PrintJobs::default())
        .register_uri_scheme_protocol(cv_pdf::SCHEME, |context, request| {
            cv_pdf::serve(&context, &request)
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_external,
            commands::open_job_url,
            commands::update_status,
            commands::check_for_updates,
            commands::restart_to_update,
            commands::set_update_channel,
            commands::take_auth_link,
            commands::take_mail_connect,
            commands::set_signed_in,
            commands::open_mail_inbox,
            commands::open_mailto,
            commands::print_cv_pdf,
            commands::save_export
        ])
        .menu(menu::build)
        .on_menu_event(|app, event| menu::handle_event(app, &event))
        .setup(|app| {
            // Installers register the scheme (macOS Info.plist, the Windows NSIS installer).
            // Development and E2E builds run unbundled on Windows, so register it for them.
            #[cfg(all(windows, any(debug_assertions, feature = "e2e")))]
            app.deep_link().register_all()?;
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                auth_link::handle_urls(&handle, &urls);
                mail_connect::handle_urls(&handle, &urls);
            });
            // A link that launched the app (Windows: the first instance's argument).
            if let Some(urls) = app.deep_link().get_current()? {
                auth_link::handle_urls(app.handle(), &urls);
                mail_connect::handle_urls(app.handle(), &urls);
            }
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
