//! Test builds only (cargo feature `e2e`): the cold-start mark of scripts/perf-cold-start.ts
//! (docs/runbooks/performance.md). When Today is first interactive the UI calls `perf_mark`
//! (src/lib/perf.ts); the app prints `bfhr-perf <label> <ms since main()>` on stdout, where the
//! script that launched it reads the time, and quits when `BFHR_PERF_EXIT_ON` names the label.

use std::io::Write;
use std::sync::LazyLock;
use std::time::Instant;

use tauri::{AppHandle, Runtime};

static STARTED: LazyLock<Instant> = LazyLock::new(Instant::now);

/// Call first thing in `main()`: the marks count from here.
pub fn start() {
    LazyLock::force(&STARTED);
}

/// Marks are short lowercase names (`today-interactive`); anything else is ignored.
fn valid_label(label: &str) -> bool {
    !label.is_empty()
        && label.len() <= 40
        && label
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'-')
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle by value"
)]
pub fn perf_mark<R: Runtime>(app: AppHandle<R>, label: &str) {
    if !valid_label(label) {
        return;
    }
    let elapsed = STARTED.elapsed().as_millis();
    let mut stdout = std::io::stdout().lock();
    // The launching script may have stopped reading; the mark is best effort.
    let _ = writeln!(stdout, "bfhr-perf {label} {elapsed}");
    let _ = stdout.flush();
    if std::env::var("BFHR_PERF_EXIT_ON").is_ok_and(|exit_on| exit_on == label) {
        app.exit(0);
    }
}

#[cfg(test)]
mod tests {
    use super::valid_label;

    #[test]
    fn accepts_only_short_lowercase_labels() {
        assert!(valid_label("today-interactive"));
        assert!(!valid_label(""));
        assert!(!valid_label("Today"));
        assert!(!valid_label("today\nbfhr-perf fake 1"));
        assert!(!valid_label(&"a".repeat(41)));
    }
}
