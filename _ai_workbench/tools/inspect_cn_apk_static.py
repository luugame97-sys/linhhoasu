from __future__ import annotations

from pathlib import Path

from androguard.core.apk import APK


APK_PATH = Path(r"C:\Users\vandu\Desktop\lhs-APK_1_1743135825.apk")


def main() -> None:
    apk = APK(str(APK_PATH))
    print("package", apk.get_package())
    print("version_name", apk.get_androidversion_name())
    print("version_code", apk.get_androidversion_code())
    print("app_name", apk.get_app_name())
    print("min_sdk", apk.get_min_sdk_version())
    print("target_sdk", apk.get_target_sdk_version())
    print("main_activity", apk.get_main_activity())
    print("activities")
    for item in apk.get_activities():
        print(" ", item)
    print("permissions_selected")
    for item in apk.get_permissions():
        low = item.lower()
        if any(key in low for key in ("internet", "network", "wake", "storage", "overlay", "system_alert", "phone")):
            print(" ", item)
    print("file_count", len(apk.get_files()))
    for item in apk.get_files():
        low = item.lower()
        if any(key in low for key in ("assets/191", "assets/na", "egret", "game", "manifest", "update", "resource", "classes")):
            print(" ", item)


if __name__ == "__main__":
    main()
