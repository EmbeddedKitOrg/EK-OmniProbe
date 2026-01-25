pub mod commands;
pub mod error;
pub mod pack;
pub mod serial;
pub mod state;
pub mod udev;
pub mod app_config;

use commands::{config, flash, memory, probe, rtt, serial as serial_cmd};
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.manage(AppState::new());

            // Linux 系统启动时检查 udev 规则
            #[cfg(target_os = "linux")]
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    check_udev_on_startup(app_handle).await;
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 探针命令
            probe::list_probes,
            probe::connect_target,
            probe::disconnect,
            probe::get_connection_status,
            probe::diagnose_usb_devices,
            probe::check_usb_permissions,
            probe::install_udev_rules,
            probe::get_udev_install_instructions,
            // RTT 独立连接命令
            probe::connect_rtt,
            probe::disconnect_rtt,
            probe::get_rtt_connection_status,
            // Flash命令
            flash::flash_firmware,
            flash::erase_chip,
            flash::erase_sector,
            flash::verify_firmware,
            flash::read_flash,
            flash::get_firmware_info,
            // 内存命令
            memory::read_memory,
            memory::write_memory,
            memory::read_registers,
            // RTT命令
            rtt::start_rtt,
            rtt::stop_rtt,
            rtt::write_rtt,
            rtt::get_rtt_status,
            rtt::clear_rtt_buffer,
            // 配置命令
            config::get_supported_chips,
            config::search_chips,
            config::get_chip_info,
            config::init_packs,
            config::import_pack,
            config::list_imported_packs,
            config::delete_pack,
            config::get_flash_algorithms,
            config::save_project_config,
            config::load_project_config,
            config::get_pack_scan_report,
            config::get_devices_without_algorithm,
            // Pack版本管理命令
            config::check_outdated_packs,
            config::rescan_pack,
            config::rescan_all_outdated_packs,
            // Pack目录管理命令
            config::get_packs_directory,
            config::set_custom_packs_directory,
            // 串口命令
            serial_cmd::list_serial_ports_cmd,
            serial_cmd::connect_serial,
            serial_cmd::disconnect_serial,
            serial_cmd::write_serial,
            serial_cmd::write_serial_string,
            serial_cmd::start_serial,
            serial_cmd::stop_serial,
            serial_cmd::get_serial_status,
            serial_cmd::clear_serial_buffer,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用程序时出错");
}

/// Linux 启动时检查 udev 规则
#[cfg(target_os = "linux")]
async fn check_udev_on_startup(app: tauri::AppHandle) {
    use tauri::Emitter;

    log::info!("检查 udev 规则...");

    // 延迟 2 秒，等待窗口完全加载
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // 检查 udev 规则是否已安装
    if !udev::check_udev_rules_installed() {
        log::warn!("未检测到 udev 规则，发送通知到前端");

        // 发送事件到前端
        let _ = app.emit("udev-rules-missing", ());
    } else {
        log::info!("udev 规则已安装");
    }
}
