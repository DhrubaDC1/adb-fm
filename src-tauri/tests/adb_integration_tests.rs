use droidbridge_lib::adb::command::AdbCommandRunner;
use droidbridge_lib::adb::wireless::WirelessService;
use droidbridge_lib::error::AppError;
use droidbridge_lib::transfer::worker::TransferWorker;
use std::path::PathBuf;
use std::time::Duration;
use tempfile::tempdir;

#[tokio::test]
async fn test_missing_adb_executable_error() {
    let runner = AdbCommandRunner::new(PathBuf::from("/nonexistent/bin/adb_fake_xyz"));
    let res = runner.execute(&["devices"], Some(Duration::from_secs(1))).await;
    match res {
        Err(AppError::AdbNotFound(msg)) => {
            assert!(msg.contains("Failed to spawn ADB binary"));
        }
        other => panic!("Expected AdbNotFound error, got {:?}", other),
    }
}

#[tokio::test]
async fn test_wireless_argument_validation() {
    let runner = AdbCommandRunner::new(PathBuf::from("adb"));

    // Empty IP
    let err1 = WirelessService::pair(&runner, "", 5555, "123456").await;
    assert!(matches!(err1, Err(AppError::InvalidArgument(_))));

    // Port 0
    let err2 = WirelessService::pair(&runner, "192.168.1.100", 0, "123456").await;
    assert!(matches!(err2, Err(AppError::InvalidArgument(_))));

    // Empty pairing code
    let err3 = WirelessService::pair(&runner, "192.168.1.100", 5555, "").await;
    assert!(matches!(err3, Err(AppError::InvalidArgument(_))));

    // Connect with port 0
    let err4 = WirelessService::connect(&runner, "192.168.1.100", 0).await;
    assert!(matches!(err4, Err(AppError::InvalidArgument(_))));
}

#[test]
fn test_compound_getprop_parsing() {
    let mock_stdout = "MODEL=Pixel 8 Pro\nMFR=Google\nVER=14\nSDK=34\n";
    let mut model = String::new();
    let mut mfr = String::new();
    let mut ver = String::new();
    let mut sdk = String::new();

    for line in mock_stdout.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("MODEL=") {
            model = val.trim().to_string();
        } else if let Some(val) = line.strip_prefix("MFR=") {
            mfr = val.trim().to_string();
        } else if let Some(val) = line.strip_prefix("VER=") {
            ver = val.trim().to_string();
        } else if let Some(val) = line.strip_prefix("SDK=") {
            sdk = val.trim().to_string();
        }
    }

    assert_eq!(model, "Pixel 8 Pro");
    assert_eq!(mfr, "Google");
    assert_eq!(ver, "14");
    assert_eq!(sdk, "34");
}

#[test]
fn test_transfer_worker_local_bytes_calculation() {
    let dir = tempdir().expect("tempdir");
    let file1 = dir.path().join("file1.bin");
    let file2 = dir.path().join("file2.bin");

    std::fs::write(&file1, vec![0u8; 1024]).expect("write file1");
    std::fs::write(&file2, vec![0u8; 2048]).expect("write file2");

    let paths = vec![
        file1.to_string_lossy().to_string(),
        file2.to_string_lossy().to_string(),
    ];

    let total = TransferWorker::calculate_local_bytes(&paths);
    assert_eq!(total, 3072);

    // Also test directory recursive calculation
    let dir_paths = vec![dir.path().to_string_lossy().to_string()];
    let dir_total = TransferWorker::calculate_local_bytes(&dir_paths);
    assert_eq!(dir_total, 3072);
}

#[test]
fn test_ipv4_validation_and_parsing() {
    use droidbridge_lib::adb::wireless::is_valid_ipv4;

    assert!(is_valid_ipv4("192.168.1.100"));
    assert!(is_valid_ipv4("10.0.0.1"));
    assert!(is_valid_ipv4("172.16.254.1"));
    assert!(!is_valid_ipv4("127.0.0.1")); // loopback rejected
    assert!(!is_valid_ipv4("0.0.0.0"));   // wildcard rejected
    assert!(!is_valid_ipv4("256.1.1.1")); // out of range
    assert!(!is_valid_ipv4("192.168.1")); // incomplete
    assert!(!is_valid_ipv4("not_an_ip"));

    // Test IP extraction regex across different Android shell outputs
    let regex = regex::Regex::new(r"(?m)(?:inet\s+|inet\s+addr:|src\s+)([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})").unwrap();

    // 1. ip -f inet addr show wlan0 format
    let ip_output = "30: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP\n    inet 192.168.1.142/24 brd 192.168.1.255 scope global wlan0";
    let caps = regex.captures(ip_output).unwrap();
    assert_eq!(&caps[1], "192.168.1.142");

    // 2. ifconfig wlan0 format (older Android versions)
    let ifconfig_output = "wlan0     Link encap:Ethernet  HWaddr 12:34:56:78:9a:bc\n          inet addr:10.0.2.15  Bcast:10.0.2.255  Mask:255.255.255.0";
    let caps2 = regex.captures(ifconfig_output).unwrap();
    assert_eq!(&caps2[1], "10.0.2.15");

    // 3. ip route format
    let ip_route = "default via 192.168.0.1 dev wlan0 proto dhcp src 192.168.0.88 metric 100";
    let caps3 = regex.captures(ip_route).unwrap();
    assert_eq!(&caps3[1], "192.168.0.88");
}

#[tokio::test]
async fn test_switch_to_wireless_invalid_explicit_ip() {
    let runner = AdbCommandRunner::new(PathBuf::from("adb"));
    let res = WirelessService::switch_to_wireless(
        &runner,
        "dummy_serial",
        5555,
        Some("invalid_ip_xyz".to_string()),
    )
    .await;

    match res {
        Err(AppError::InvalidArgument(msg)) => {
            assert!(msg.contains("not a valid IPv4 address"));
        }
        other => panic!("Expected InvalidArgument error, got {:?}", other),
    }
}
