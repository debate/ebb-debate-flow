//! Ebb's native menu.
//!
//! ## Menu design
//!
//! Ebb is keyboard-first and the JS keymap in `src/lib/keymap` is the single
//! source of truth for every app binding. The menu mirrors those commands so
//! they are also reachable by mouse.
//!
//! Every app command item carries its JS `CommandId` as the menu id. Clicking
//! emits a `menu:command` event that the frontend runs via `executeCommand`
//! (see `useDesktopMenu`). The chord printed in each label is display-only
//! text, never a real accelerator: a menu accelerator is consumed by the OS
//! *before* the webview's keydown fires, which would silently break the JS
//! keymap's focus logic (several chords are focus-dependent - Meta+A means
//! "new aff" in grid focus but native select-all while typing).
//!
//! Cut/Copy/Paste are the exception: they are real `PredefinedMenuItem`s with
//! accelerators. macOS WKWebView routes an editing shortcut into the focused
//! text field only when a menu item carries that accelerator; without one the
//! chord never reaches the field (Meta+C copies nothing, etc.). Their chords
//! (Meta+X / Meta+C / Meta+V) are not app bindings, so installing the
//! accelerators costs nothing and fixes native clipboard editing.
//!
//! Select All stays a display-only hint: Meta+A is the app's `sheet.newAff`
//! binding, so its text-field select-all behavior is restored in JS instead -
//! see `selectAllInElement` / `useDesktopSelectAll` in `src/lib/keymap`.

use tauri::menu::{AboutMetadata, Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

/// Menu item id for the single deliberate-exit path.
pub const QUIT_ID: &str = "quit";

/// Builds the application menu.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // Pads a label so its display-only chord hint sits in a rough right column.
    let pad = |label: &str, chord: &str| format!("{label:<26}{chord}");

    // A clickable command item: its id is a JS CommandId, emitted on click.
    // The chord is label text only, never a real accelerator (see module docs).
    let cmd = |id: &str, label: &str, chord: &str| -> tauri::Result<_> {
        MenuItemBuilder::new(pad(label, chord)).id(id).build(app)
    };

    // A greyed reference row: shows the binding, does nothing when clicked.
    let hint = |label: &str| -> tauri::Result<_> {
        MenuItemBuilder::new(label).enabled(false).build(app)
    };

    // Custom Quit so we own the only deliberate exit (handled in lib.rs via
    // app.exit). Meta+Q is not an app binding, so the accelerator is safe.
    let quit = MenuItemBuilder::new("Quit Ebb")
        .id(QUIT_ID)
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    // macOS application menu (the bold first menu). On other platforms this
    // simply contributes a leading "Ebb" submenu, which is harmless.
    let app_menu = SubmenuBuilder::new(app, "Ebb")
        .item(&PredefinedMenuItem::about(
            app,
            Some("About Ebb"),
            Some(AboutMetadata::default()),
        )?)
        .separator()
        .item(&cmd("settings.open", "Settings", "\u{2318},")?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&quit)
        .build()?;

    // File: sheet creation / structure commands.
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&cmd("sheet.newAff", "New Aff Sheet", "\u{21e7}\u{2318}A")?)
        .item(&cmd("sheet.newNeg", "New Neg Sheet", "\u{21e7}\u{2318}N")?)
        .item(&cmd("sheet.rename", "Rename Sheet", "\u{2318}R")?)
        .separator()
        .item(&cmd("info.open", "Round Info", "")?)
        .item(&cmd("settings.open", "Settings", "\u{2318},")?)
        .build()?;

    // Edit: Undo/Redo and the format/row commands are clickable (they emit
    // their CommandId). Cut/Copy/Paste carry real accelerators so WKWebView
    // routes them to the focused text field; Select All is display-only.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&cmd("edit.undo", "Undo", "\u{2318}Z")?)
        .item(&cmd("edit.redo", "Redo", "\u{21e7}\u{2318}Z")?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&hint("Select All               \u{2318}A")?)
        .separator()
        .item(&cmd("format.toggleBold", "Bold", "\u{2318}B")?)
        .item(&cmd("format.toggleHighlight", "Highlight", "\u{21e7}\u{2318}H")?)
        .item(&cmd("format.toggleCard", "Card", "\u{2318}T")?)
        .separator()
        .item(&cmd("row.insertAbove", "Insert Row", "\u{21e7}\u{2318}O")?)
        .item(&cmd("cell.insert", "Insert Cell", "\u{2318}O")?)
        .item(&cmd("row.delete", "Delete Row", "\u{2318}\u{232b}")?)
        .build()?;

    // View: navigation and panel toggles.
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&cmd("sheet.next", "Next Sheet", "]")?)
        .item(&cmd("sheet.prev", "Previous Sheet", "[")?)
        .separator()
        .item(&cmd("sheet.quickSwitch", "Search Cells", "\u{2318}P")?)
        .item(&cmd("palette.open", "Command Palette", "\u{21e7}\u{2318}P")?)
        .separator()
        .item(&cmd("sidebar.toggle", "Toggle Sidebar", "\u{2318}\\")?)
        .item(&cmd("rfd.toggle", "Toggle RFD", "\u{2318}J")?)
        .build()?;

    // Help: opens the in-app keybindings guide.
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&cmd("help.open", "Keyboard Shortcuts", "?")?)
        .build()?;

    let mut builder = tauri::menu::MenuBuilder::new(app);
    builder = builder.items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &help_menu]);
    builder.build()
}
