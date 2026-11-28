import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'api.dart';
import 'auth.dart';
import 'brand.dart';
import 'saved_store.dart';
import 'screens.dart';
import 'widgets.dart';

/// Pages that open inside the app. Only MetaDeals4U's own address, over https, and never the admin area.
bool allowInApp(Uri uri, String host) =>
    uri.scheme == 'https' && uri.host == host && !uri.path.startsWith('/admin') && !uri.path.startsWith('/api/v1/admin');

const _agentSuffix = ' MetaDeals4UApp/1.0';

/// The website page itself (no bar of its own): used by the bottom tabs, the profile pages and the sign-in page.
class WebBody extends StatefulWidget {
  const WebBody({super.key, required this.path, this.onSignedIn});
  final String path;

  /// Called when the page notices the member is signed in (used by the sign-in screen).
  final VoidCallback? onSignedIn;

  @override
  State<WebBody> createState() => _WebBodyState();
}

class _WebBodyState extends State<WebBody> with AutomaticKeepAliveClientMixin {
  late final WebViewController _controller;
  bool _loading = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    final host = Uri.parse(apiBase).host;
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF1F0FF))
      ..addJavaScriptChannel('App', onMessageReceived: (message) {
        if (message.message == 'in') widget.onSignedIn?.call();
      })
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (request) {
          final uri = Uri.tryParse(request.url);
          if (uri == null) return NavigationDecision.prevent;
          if (allowInApp(uri, host)) return NavigationDecision.navigate;
          // Store links and other sites open in the phone's browser; the admin area and non-https links do not open at all.
          if (uri.scheme == 'https' && !uri.path.startsWith('/admin')) launchUrl(uri, mode: LaunchMode.externalApplication);
          return NavigationDecision.prevent;
        },
        onPageStarted: (_) { if (mounted) setState(() => _loading = true); },
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
          if (widget.onSignedIn != null) {
            _controller.runJavaScript("fetch('/api/v1/customer/session',{cache:'no-store'}).then(r=>r.json()).then(j=>App.postMessage(j&&j.user?'in':'out')).catch(()=>{})");
          }
        },
      ));
    _controller.getUserAgent().then((agent) async {
      _controller.setUserAgent('${agent ?? ''}$_agentSuffix');
      // Signed in natively (Google / Apple): the web view gets the website's own session first, using the app token in a header.
      final token = await AppAuth.instance.accessToken();
      if (token == null) return _controller.loadRequest(Uri.parse('$apiBase${widget.path}'));
      _controller.loadRequest(Uri.parse('$apiBase/api/v1/mobile/auth/web-session?next=${Uri.encodeQueryComponent(widget.path)}'), headers: {'authorization': 'Bearer $token'});
    });
  }

  Future<bool> goBackIfPossible() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return true;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Stack(children: [
      WebViewWidget(controller: _controller),
      if (_loading) const LinearProgressIndicator(minHeight: 2),
    ]);
  }
}

/// A bottom-tab page: the website page below the shared top bar.
class WebTab extends StatelessWidget {
  const WebTab({super.key, required this.path});
  final String path;

  @override
  Widget build(BuildContext context) => WebBody(path: path);
}

/// A full page opened from the profile menu (with the logo bar and a back arrow).
class WebPage extends StatelessWidget {
  const WebPage({super.key, required this.path, required this.title});
  final String path, title;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: const BrandAppBar(showBack: true),
        body: SafeArea(top: false, child: WebBody(path: path)),
      );
}

/// Saved deals (kept on this phone), shown with the same top bar.
class SavedPage extends StatelessWidget {
  const SavedPage({super.key, required this.saved});
  final SavedStore saved;

  @override
  Widget build(BuildContext context) => SavedScreen(api: Api(), saved: saved);
}

/// Shown after the first-run slides: Google / Apple (native) or the website's email sign-in. "Skip" goes straight to the deals.
class LoginGate extends StatefulWidget {
  const LoginGate({super.key, required this.onDone, required this.onSkip});
  final VoidCallback onDone, onSkip;

  @override
  State<LoginGate> createState() => _LoginGateState();
}

class _LoginGateState extends State<LoginGate> {
  bool _email = false, _busy = false;
  String? _error;

  Future<void> _run(Future<void> Function() signIn) async {
    setState(() { _busy = true; _error = null; });
    try {
      await signIn();
      widget.onDone();
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AppAuth.instance;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        titleSpacing: 16,
        title: const BrandLogo(),
        actions: [TextButton(onPressed: widget.onSkip, child: const Text('Skip for now')), const SizedBox(width: 8)],
      ),
      body: SafeArea(
        top: false,
        child: _email
            ? Column(children: [
                Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: () => setState(() => _email = false), icon: const Icon(Icons.arrow_back), label: const Text('Other ways to sign in'))),
                Expanded(child: WebBody(path: '/account', onSignedIn: widget.onDone)),
              ])
            : Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('Sign in to MetaDeals4U', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  const Text('Save deals, post in the forum and submit deals.', textAlign: TextAlign.center, style: TextStyle(color: Colors.black54)),
                  const SizedBox(height: 28),
                  if (auth.googleAvailable)
                    OutlinedButton.icon(style: _btn, onPressed: _busy ? null : () => _run(auth.signInWithGoogle), icon: const Icon(Icons.g_mobiledata, size: 30), label: const Text('Continue with Google')),
                  if (auth.appleAvailable) ...[
                    const SizedBox(height: 12),
                    FilledButton.icon(style: _btn.copyWith(backgroundColor: const WidgetStatePropertyAll(Colors.black)), onPressed: _busy ? null : () => _run(auth.signInWithApple), icon: const Icon(Icons.apple), label: const Text('Continue with Apple')),
                  ],
                  const SizedBox(height: 12),
                  FilledButton.icon(style: _btn.copyWith(backgroundColor: const WidgetStatePropertyAll(brandPurple)), onPressed: _busy ? null : () => setState(() => _email = true), icon: const Icon(Icons.email_outlined), label: const Text('Continue with email')),
                  if (_busy) const Padding(padding: EdgeInsets.only(top: 16), child: Center(child: CircularProgressIndicator())),
                  if (_error != null) Padding(padding: const EdgeInsets.only(top: 16), child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red))),
                ]),
              ),
      ),
    );
  }

  static final _btn = ButtonStyle(minimumSize: const WidgetStatePropertyAll(Size.fromHeight(52)), shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))));
}
