import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'api.dart';
import 'brand.dart';
import 'saved_store.dart';
import 'screens.dart';

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
    _controller.getUserAgent().then((agent) {
      _controller.setUserAgent('${agent ?? ''}$_agentSuffix');
      _controller.loadRequest(Uri.parse('$apiBase${widget.path}'));
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

/// Shown after the first-run slides: the website's sign-in page. "Skip" goes straight to the deals.
class LoginGate extends StatelessWidget {
  const LoginGate({super.key, required this.onDone, required this.onSkip});
  final VoidCallback onDone, onSkip;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          titleSpacing: 16,
          title: const BrandLogo(),
          actions: [TextButton(onPressed: onSkip, child: const Text('Skip for now')), const SizedBox(width: 8)],
        ),
        body: SafeArea(top: false, child: WebBody(path: '/account', onSignedIn: onDone)),
      );
}
