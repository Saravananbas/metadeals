# MetaDeals4U Android app (Flutter)

Public deals only: browse, search, categories, deal details, save on the phone, share, Buy Now (opens MetaDeals4U's own /go link in the browser). **No admin portal**: the app only calls `/api/v1/mobile/*` and never opens `/admin`.

## One-time setup
1. Install Android Studio. In SDK Manager install Android SDK Platform 35, Build-Tools, Command-line Tools and Platform-Tools.
2. `flutter doctor --android-licenses`, then `flutter doctor` (Android toolchain must show a tick).

## Build
```
cd mobile
flutter pub get
flutter test
flutter build apk --release --dart-define=API_BASE=https://staging.metadeals4u.in
```
The APK is `build/app/outputs/flutter-apk/app-release.apk`. Use `--dart-define=API_BASE=https://metadeals4u.in` for production.
Release signing (needed for the Play Store, not for testing): create a keystore, keep it and its password OUT of Git, and add it in `android/app/build.gradle.kts`.

## Not in version 1
Sign-in, Post a Deal, forum, push notifications, Play Store listing.
