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

## Google and Apple sign-in (native)

The app signs in with the provider's own SDK and sends the ID token to `/api/v1/mobile/auth/google` or `/apple`; the backend checks it and returns app tokens (kept in secure storage). The web view tabs then receive the website session through `/api/v1/mobile/auth/web-session` (token sent in a header).

Setup (owner):
1. Google Cloud: create an **Android** OAuth client for `in.metadeals4u.app` (SHA-1 of `upload-keystore.jks`, and later the Play App Signing SHA-1) and a **Web** OAuth client. Build with `--dart-define=GOOGLE_WEB_CLIENT_ID=<web client id>`; without it the Google button is hidden.
2. Backend env (Hostinger): `GOOGLE_NATIVE_CLIENT_IDS=<web client id>,<android client id>` and, for iOS, `APPLE_NATIVE_CLIENT_IDS=in.metadeals4u.app`. Redeploy after changing.
3. iOS: add the Sign in with Apple capability to the app id and Xcode project; for Google on iOS add an iOS OAuth client, `GIDClientID` and the reversed-client-id URL scheme to `Info.plist`.
4. The Apple button shows on iOS only; Google shows when `GOOGLE_WEB_CLIENT_ID` is set.
