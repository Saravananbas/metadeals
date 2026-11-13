import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'models.dart';
import 'saved_store.dart';
import 'widgets.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api, required this.saved});
  final Api api;
  final SavedStore saved;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _deals = <Deal>[];
  final _scroll = ScrollController();
  final _search = TextEditingController();
  List<Category> _categories = [];
  String _category = '';
  String _query = '';
  String? _cursor;
  bool _loading = false, _done = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 600) _load();
    });
    widget.api.categories().then((c) => mounted ? setState(() => _categories = c.where((x) => x.parentId == null && x.count >= 0).toList()) : null).catchError((_) {});
    _load(reset: true);
  }

  @override
  void dispose() {
    _scroll.dispose();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading || (_done && !reset)) return;
    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _deals.clear();
        _cursor = null;
        _done = false;
      }
    });
    try {
      final page = await widget.api.deals(q: _query, category: _category, cursor: _cursor);
      if (!mounted) return;
      setState(() {
        _deals.addAll(page.deals);
        _cursor = page.nextCursor;
        _done = page.nextCursor == null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _open(Deal deal) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => DealScreen(api: widget.api, saved: widget.saved, summary: deal)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('MetaDeals4U', style: TextStyle(fontWeight: FontWeight.w800, color: brandPurple)),
        actions: [
          IconButton(
            tooltip: 'Saved deals',
            icon: const Icon(Icons.favorite_border),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => SavedScreen(api: widget.api, saved: widget.saved))),
          ),
          IconButton(tooltip: 'About', icon: const Icon(Icons.info_outline), onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AboutScreen()))),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
          child: TextField(
            controller: _search,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search deals, brands, products',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _query.isEmpty ? null : IconButton(icon: const Icon(Icons.close), onPressed: () { _search.clear(); _query = ''; _load(reset: true); }),
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(30), borderSide: BorderSide.none),
              contentPadding: EdgeInsets.zero,
            ),
            onSubmitted: (v) { _query = v; _load(reset: true); },
          ),
        ),
        SizedBox(
          height: 52,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8), children: [
            _chip('All Deals', ''),
            for (final c in _categories) _chip(c.name, c.slug),
          ]),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _load(reset: true),
            child: ListenableBuilder(
              listenable: widget.saved,
              builder: (context, _) => ListView.builder(
                controller: _scroll,
                physics: const AlwaysScrollableScrollPhysics(),
                itemCount: _deals.length + 1,
                itemBuilder: (context, i) {
                  if (i < _deals.length) {
                    final deal = _deals[i];
                    return DealCard(api: widget.api, deal: deal, saved: widget.saved.isSaved(deal.id), onSave: () => widget.saved.toggle(deal), onOpen: () => _open(deal));
                  }
                  if (_loading) return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
                  if (_error != null) return Padding(padding: const EdgeInsets.all(24), child: Column(children: [Text(_error!), TextButton(onPressed: () => _load(reset: _deals.isEmpty), child: const Text('Try again'))]));
                  if (_deals.isEmpty) return const Padding(padding: EdgeInsets.all(40), child: Center(child: Text('No deals found.')));
                  return const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('You have seen all deals.', style: TextStyle(color: Colors.black45))));
                },
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _chip(String label, String slug) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          label: Text(label),
          selected: _category == slug,
          selectedColor: brandPurple,
          labelStyle: TextStyle(color: _category == slug ? Colors.white : null, fontWeight: FontWeight.w600),
          onSelected: (_) { _category = slug; _load(reset: true); },
        ),
      );
}

class DealScreen extends StatefulWidget {
  const DealScreen({super.key, required this.api, required this.saved, required this.summary});
  final Api api;
  final SavedStore saved;
  final Deal summary;

  @override
  State<DealScreen> createState() => _DealScreenState();
}

class _DealScreenState extends State<DealScreen> {
  late Deal deal = widget.summary;

  @override
  void initState() {
    super.initState();
    widget.api.deal(widget.summary.slug).then((d) => mounted ? setState(() => deal = d) : null).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final images = deal.gallery.isNotEmpty ? deal.gallery : [deal.imageUrl];
    return Scaffold(
      appBar: AppBar(title: Text(deal.merchantName), actions: [
        IconButton(tooltip: 'Share', icon: const Icon(Icons.share), onPressed: () => SharePlus.instance.share(ShareParams(text: '${deal.title} at ${rupees(deal.price)}\n${widget.api.base}/deal/${deal.slug}'))),
        ListenableBuilder(
          listenable: widget.saved,
          builder: (_, _) => IconButton(
            tooltip: 'Save deal',
            icon: Icon(widget.saved.isSaved(deal.id) ? Icons.favorite : Icons.favorite_border, color: widget.saved.isSaved(deal.id) ? Colors.red : null),
            onPressed: () => widget.saved.toggle(deal),
          ),
        ),
      ]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        SizedBox(
          height: 260,
          child: PageView(children: [for (final url in images) Container(margin: const EdgeInsets.symmetric(horizontal: 4), decoration: BoxDecoration(color: const Color(0xFFF3F0FF), borderRadius: BorderRadius.circular(16)), padding: const EdgeInsets.all(10), child: DealImage(url))]),
        ),
        const SizedBox(height: 14),
        Text(deal.title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Text(rupees(deal.price), style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, color: const Color(0xFF2E1065))),
          const SizedBox(width: 8),
          if (deal.mrp > deal.price) Text(rupees(deal.mrp), style: const TextStyle(decoration: TextDecoration.lineThrough, color: Colors.black45)),
          const SizedBox(width: 8),
          if (deal.discountPercent > 0) Text('${deal.discountPercent}% off', style: const TextStyle(color: Color(0xFF166534), fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: 14),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: brandOrange, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
          onPressed: () => openBuyNow(context, widget.api, deal.outboundUrl),
          icon: const Icon(Icons.open_in_new),
          label: Text('Buy Now at ${deal.merchantName}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        ),
        const SizedBox(height: 8),
        const Text('Prices and offers can change. Check the final price on the store before you pay. We may earn a commission at no extra cost to you.', style: TextStyle(fontSize: 12, color: Colors.black54)),
        if (deal.description.isNotEmpty) ...[
          const SizedBox(height: 18),
          const Text('About this item', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 6),
          Text(deal.description),
        ],
      ]),
    );
  }
}

class SavedScreen extends StatelessWidget {
  const SavedScreen({super.key, required this.api, required this.saved});
  final Api api;
  final SavedStore saved;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Saved deals')),
        body: ListenableBuilder(
          listenable: saved,
          builder: (context, _) {
            final deals = saved.deals;
            if (deals.isEmpty) return const Center(child: Padding(padding: EdgeInsets.all(32), child: Text('Tap the heart on a deal to keep it here. Saved deals stay on this phone only.', textAlign: TextAlign.center)));
            return ListView(children: [
              for (final deal in deals)
                DealCard(
                  api: api,
                  deal: deal,
                  saved: true,
                  onSave: () => saved.toggle(deal),
                  onOpen: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => DealScreen(api: api, saved: saved, summary: deal))),
                ),
            ]);
          },
        ),
      );
}

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  Future<void> _open(String path) => launchUrl(Uri.parse('$apiBase$path'), mode: LaunchMode.externalApplication);

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('About')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('MetaDeals4U lists deals from online stores. When you tap Buy Now you go to the store, and the sale is between you and that store. We may earn a commission at no extra cost to you.'),
          const SizedBox(height: 16),
          ListTile(title: const Text('Privacy Policy'), trailing: const Icon(Icons.open_in_new), onTap: () => _open('/privacy')),
          ListTile(title: const Text('Terms & Conditions'), trailing: const Icon(Icons.open_in_new), onTap: () => _open('/terms')),
          ListTile(title: const Text('Disclaimer'), trailing: const Icon(Icons.open_in_new), onTap: () => _open('/disclaimer')),
          ListTile(title: const Text('Cookie Policy'), trailing: const Icon(Icons.open_in_new), onTap: () => _open('/cookies')),
        ]),
      );
}
