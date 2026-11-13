import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'api.dart';

/// Pages that open inside the app. Only MetaDeals4U's own address, over https, and never the admin area.
bool allowInApp(Uri uri, String host) =>
    uri.scheme == 'https' && uri.host == host && !uri.path.startsWith('/admin') && !uri.path.startsWith('/api/v1/admin');

const _agentSuffix = ' MetaDeals4UApp/1.0';

/// The website's forum, sign-in and Post a Deal pages shown inside the app. Sign-in cookies are kept by the WebView.
class WebTab extends StatefulWidget {
  const WebTab({super.key, required this.path, required this.title});
  final String path, title;

  @override
  State<WebTab> createState() => _WebTabState();
}

class _WebTabState extends State<WebTab> with AutomaticKeepAliveClientMixin {
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
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (request) {
          final uri = Uri.tryParse(request.url);
          if (uri == null) return NavigationDecision.prevent;
          if (allowInApp(uri, host)) return NavigationDecision.navigate;
          // Store links and other sites open in the phone's browser; the admin area and non-https links do not open at all.
          if (uri.scheme == 'https' && !uri.path.startsWith('/admin')) launchUrl(uri, mode: LaunchMode.externalApplication);
          return NavigationDecision.prevent;
        },
        onPageStarted: (_) => setState(() => _loading = true),
        onPageFinished: (_) => setState(() => _loading = false),
      ));
    _controller.getUserAgent().then((agent) {
      _controller.setUserAgent('${agent ?? ''}$_agentSuffix');
      _controller.loadRequest(Uri.parse('$apiBase${widget.path}'));
    });
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else if (context.mounted) {
          Navigator.of(context).maybePop();
        }
      },
      child: Scaffold(
        appBar: AppBar(title: Text(widget.title), actions: [IconButton(tooltip: 'Reload', icon: const Icon(Icons.refresh), onPressed: _controller.reload)]),
        body: Stack(children: [
          WebViewWidget(controller: _controller),
          if (_loading) const LinearProgressIndicator(minHeight: 2),
        ]),
      ),
    );
  }
}
