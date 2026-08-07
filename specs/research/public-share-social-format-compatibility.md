# Public Share social-format compatibility

**Research date:** 2026-08-05
**Question:** Can Pixel Forge use one scaled, transparent, animated WebP for its public viewer, downloads, and social/link previews?

## Decision in one paragraph

Use **lossless WebP with alpha as the default published artwork**, including animated WebP for animations, and encode the artist's selected integer scale into the actual pixels. Do **not** reuse that file as the only social-preview asset. Every Share Page should also have a static, opaque `1200x630` PNG social card made from an artist-selected cover frame, plus on-demand PNG and animated GIF compatibility downloads. The page can therefore show the faithful transparent animation while Reddit, Facebook, X, messaging clients, and other Open Graph consumers receive a conservative static preview. One canonical WebP is not a safe universal contract.

## Why WebP is the right primary artwork

The WebP container supports lossless compression, 8-bit alpha, animation, per-frame durations, blending/disposal, and looping. Google documents animation support in Chrome 32+, Edge 18+, Firefox 65+, and Safari 14+, including the corresponding mobile browsers. Animated WebP therefore covers Pixel Forge's signed-out web viewer well and preserves transparency and full color better than GIF. ([WebP container specification](https://developers.google.com/speed/webp/docs/riff_container), [WebP browser support and animation comparison](https://developers.google.com/speed/webp/faq))

Pixel art should use **lossless**, not lossy, WebP. The selected publication scale must be baked into the output dimensions with nearest-neighbor replication:

```text
16x16 source at 4x -> 64x64 WebP pixels
```

The viewer should additionally use `image-rendering: pixelated` when it resizes the artwork on screen. CSS can preserve crisp presentation in the Share Page, but it does not alter a downloaded file; this is why the chosen scale must also be encoded into the artifact itself. The CSS definition explicitly describes nearest-neighbor scaling to the nearest integer multiple before final interpolation. ([CSS Images specification](https://drafts.csswg.org/css-images-3/#the-image-rendering))

One WebP portability edge must remain visible: the WebP specification says interpretation of frame durations of `0ms`, and often durations up to `10ms`, is implementation-defined. Publishing should warn about those durations rather than silently changing the animation. ([WebP animation frame duration](https://developers.google.com/speed/webp/docs/riff_container#animation))

## Why the same file should not be the social card

Open Graph requires a representative `og:image`, but does not define animated-image playback. It supports explicit image type, width, height, and alt-text metadata, and gives the first declared image preference when several images exist. ([Open Graph protocol](https://ogp.me/))

Facebook recommends `1200x630` images for high-resolution link posts and at least `600x315` for the large-image treatment. A native `64x64` result from the example above is therefore a valid art export but a poor link card. ([Facebook sharing image guide](https://developers.facebook.com/docs/sharing/webmasters/images/))

Reddit's current first-party guidance for its own app share previews explicitly asks for a **static image URL** and says the same image is reused across destinations such as iMessage, WhatsApp, SMS, and Slack. Its developer media service accepts WebP in some contexts but warns that a WebP upload may be converted to JPEG. These are not specifications for ordinary Reddit link posts, but they demonstrate that Reddit does not offer a general transparent animated-WebP preview contract. ([Reddit share previews](https://developers.reddit.com/docs/guides/logged-out-users#customize-sharing-to-attract-new-players), [Reddit media uploads](https://developers.reddit.com/docs/capabilities/server/media-uploads))

The practical Share Page metadata should therefore use a separate card:

```html
<meta property="og:type" content="website">
<meta property="og:url" content="https://pixel-forge.example/s/sunny-beach">
<meta property="og:image" content="https://cdn.example/share/revision-hash/card.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Sunny Beach, pixel art by Artist">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://cdn.example/share/revision-hash/card.png">
<meta name="twitter:image:alt" content="Sunny Beach, pixel art by Artist">
```

The social card should:

- use the chosen cover frame for an animation;
- enlarge the art only by an integer factor, centered without interpolation;
- use an artist-selected or contrast-safe opaque background so transparent pixels remain understandable across light, dark, or transparency-stripping clients;
- include restrained Pixel Forge/artist attribution outside the art, without modifying the downloadable artwork;
- use a content-addressed URL per Published Revision.

An unlisted Share Page may use `noindex`, but the HTML and card image must remain accessible over HTTPS without authentication, cookies, or crawler-blocking rules. Otherwise link-preview services cannot retrieve them. This is an implementation inference from the Open Graph fetch model, not a cross-platform guarantee.

## Direct upload and download compatibility

| Destination | First-party evidence | Pixel Forge implication |
| --- | --- | --- |
| **Reddit** | Reddit supports Link and Images & Video post types, but its consumer help does not publish an authoritative normal-post file-format matrix. Community settings can independently disallow links, images, GIFs, or videos. Its developer media API accepts PNG/JPEG/WebP/GIF up to `20MB`, but may convert WebP to JPEG. ([posting](https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit), [community settings](https://support.reddithelp.com/hc/en-us/articles/15484546290068-Community-settings), [developer media](https://developers.reddit.com/docs/capabilities/server/media-uploads)) | Make **Copy Reddit link** open a normal URL submission flow and use the static PNG card. Offer animated GIF as the conservative direct-upload download. Treat direct animated-WebP upload as unverified until tested against current desktop, iOS, and Android clients. |
| **Facebook and Open Graph consumers** | Open Graph defines representative image metadata but no animation behavior. Facebook recommends `1200x630` for high-resolution link cards. ([Open Graph](https://ogp.me/), [Facebook image guide](https://developers.facebook.com/docs/sharing/webmasters/images/)) | Share the URL with a static PNG card; the clicked Share Page plays the animated WebP. |
| **LinkedIn direct upload** | LinkedIn's first-party Images API lists JPG, GIF, and PNG, with animated GIF capped at 250 frames; WebP is absent. ([LinkedIn Images API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api)) | Do not promise that the default WebP can be uploaded. Provide PNG/GIF compatibility downloads. |
| **Bluesky direct upload** | Bluesky's official posting guide includes `image/webp`, limits each image to `2MB`, and requires alt text in the embed model. It does not say that animated WebP will animate. Its website-card example fetches `og:image` and stores a thumbnail blob. ([image posts](https://docs.bsky.app/docs/tutorials/creating-a-post), [website cards](https://docs.bsky.app/docs/advanced-guides/posts#website-card-embeds)) | Static WebP is supported, but animation remains unverified. Use the static PNG for the link card and offer GIF for portable animation. |
| **Mastodon direct upload** | Current Mastodon guidance accepts static WebP images up to `16MB`, but identifies animated GIF, MP4, and WebM as its looping-animation path; actual limits are instance-configurable. ([attachments](https://docs.joinmastodon.org/user/posting/#attachments), [instance media configuration](https://docs.joinmastodon.org/entities/Instance/#configuration)) | Do not assume an animated WebP remains animated after upload. Offer GIF; future MP4/WebM export can improve large-animation compatibility but is not required for the Share Page foundation. |
| **X link cards** | The former first-party card documentation currently redirects to the generic X developer overview, so its previous format and size table is no longer a confirmed-current contract. ([current redirect target](https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image)) | Emit conventional `summary_large_image` tags with the static PNG and keep X in the live compatibility test matrix. Do not claim animated WebP link-card support. |
| **Browser or OS share sheet** | The Web Share Recommendation allows sharing URLs and files, but requires checking `navigator.canShare({ files })`; available targets and accepted payloads vary by user agent and operating system. ([Web Share API](https://www.w3.org/TR/web-share/)) | Try native file sharing only after `canShare`. Always retain Copy link and Download controls as deterministic fallbacks. |

## Recommended Published Revision artifacts

```text
Share Page (stable friendly URL)
└── Published Revision (immutable)
    ├── artwork.webp       lossless; alpha; animated when applicable; chosen integer scale
    ├── cover.png          one lossless frame at chosen integer scale
    ├── social-card.png    static opaque 1200x630 Open Graph image
    └── artwork.gif        compatibility derivative, generated on demand or at publish time
```

The default visible/download action is `artwork.webp`. The share menu should keep the choices plain:

- **Copy link** — best default; preserves animation and attribution through the Share Page.
- **Share** — use the OS share sheet for the URL; offer the file only when `canShare` accepts it.
- **Download WebP** — faithful default, including animated transparency.
- **Download GIF (compatible)** — broader animation upload path, with a warning that GIF has 8-bit indexed color and 1-bit alpha versus WebP's 24-bit color and 8-bit alpha. ([WebP versus GIF](https://developers.google.com/speed/webp/faq#why_should_i_use_animated_webp))
- **Download PNG** — selected static cover/frame.

The publication dialog should show the resulting pixel dimensions and estimated bytes before publishing. Useful scale presets are `1x`, `2x`, `4x`, `8x`, plus a **Fit to at least 512px** option that chooses an integer scale. It must never silently smooth, crop, quantize, or replace transparency in the primary WebP.

## Required live compatibility checks before 1.0

Platform behavior changes independently of Pixel Forge, and several consumer contracts are undocumented. Run a small production-domain fixture through these checks at the start of implementation and before release:

1. Static transparent WebP and animated transparent WebP in supported desktop/mobile browsers.
2. Reddit link post preview plus direct WebP/GIF upload on web, iOS, and Android.
3. Facebook Sharing Debugger and a real Messenger/Facebook paste.
4. X, LinkedIn, Bluesky, Mastodon, Discord, Slack, iMessage, and WhatsApp link unfurls.
5. Native file share using `navigator.canShare` on iOS and Android.
6. Republish the stable Share Page with a new content-addressed card URL and verify which destinations refresh versus retain a cached preview.

Record each result with date, client version, accepted MIME type, whether animation and alpha survived, whether pixels stayed crisp, and any size/frame limit encountered. Until those tests run, Discord, Slack, iMessage, WhatsApp, ordinary Reddit link-preview WebP support, X card constraints, and animated-WebP direct-upload behavior remain explicitly **unknown**, not promised 1.0 contracts.
