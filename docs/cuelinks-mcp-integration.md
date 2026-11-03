# Cuelinks MCP (Model Context Protocol) Integration

**Endpoint:** `https://mcp.cuelinks.com`  
**API Version:** Cuelinks V3 API  
**Status:** Integrated with MetaDeals4U Affiliate Engine and Deal Intelligence Scraper

---

## 1. What is Cuelinks MCP?

Cuelinks provides an official Model Context Protocol (MCP) server at `https://mcp.cuelinks.com`. It allows AI assistants, development agents, and server applications to interact directly with Cuelinks affiliate marketing accounts.

### Available MCP Capabilities:
1. **`convert_link`**: Converts raw merchant product URLs (Amazon, Flipkart, Myntra, Tata Cliq, Croma, Reliance Digital, AJIO, etc.) into monetized shortlinks (`https://clnk.in/r?...`).
2. **`search_campaigns`**: Discovers active campaigns, payout commission structures, and merchant domain allowlists.
3. **`get_transactions`**: Pulls real-time transaction reports, commission amounts, and order statuses.

---

## 2. MetaDeals4U Integration Architecture

MetaDeals4U integrates Cuelinks across two layers:

### A. Runtime Affiliate Redirection Layer (`src/server/affiliate/`)
- **`CuelinksMcpAdapter`** (`src/server/affiliate/adapters/cuelinks-mcp.ts`): Automatically converts destination retailer URLs to `clnk.in` shortlinks when shoppers click `/go/[dealId]` for supported merchants (e.g. Myntra, Tata Cliq, Croma, Reliance Digital, AJIO).
- **`CuelinksClient`** (`src/server/affiliate/cuelinks-client.ts`): Provides programmatic API client for automated campaign search, link conversion, and transaction report pulling.

### B. Scraper Discovery & Deal Intelligence (`src/server/scraper/`)
- **`CuelinksFeedConnector`** (`src/server/scraper/connectors/cuelinks-feed.ts`): Periodically queries Cuelinks campaign feeds and curated deal drops to discover fresh electronics and appliances discounts for verification and auto-publication.

---

## 3. Configuration & Environment Variables

Add your Cuelinks credentials to `.env`:

```env
# Cuelinks MCP and API Credentials
CUELINKS_PUBLISHER_ID="your_cuelinks_publisher_id"
CUELINKS_PUB_ID="your_cuelinks_publisher_id"
CUELINKS_API_KEY="your_v3_api_key_from_dashboard"
CUELINKS_MCP_URL="https://mcp.cuelinks.com"
```

### Where to get credentials:
1. Log in to your publisher dashboard at [cuelinks.com](https://www.cuelinks.com).
2. Go to **Settings > API Keys** to generate your V3 API key.
3. Your Publisher ID is visible on your profile and dashboard.

---

## 4. Connecting Directly to Antigravity / AI Tools

To connect this MCP server directly to Antigravity or any MCP client:

### MCP Server Config (`antigravity.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cuelinks": {
      "url": "https://mcp.cuelinks.com",
      "headers": {
        "Authorization": "Bearer YOUR_CUELINKS_API_KEY"
      }
    }
  }
}
```

Once connected, you can run prompts like:
- *"Search top campaigns for electronics in Cuelinks"*
- *"Convert this Samsung TV link into a tracked Cuelinks link"*
- *"Pull yesterday's commission transactions"*
