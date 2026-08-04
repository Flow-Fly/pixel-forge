# Platform and store delivery paths

**Status:** Research decision for [issue #438](https://github.com/Flow-Fly/pixel-forge/issues/438)

**Map:** [Pixel Forge 1.0 trustworthy creative editor and automation plan](https://github.com/Flow-Fly/pixel-forge/issues/432)

**Context:** [Mobile apps #382](https://github.com/Flow-Fly/pixel-forge/issues/382), [product website and support #403](https://github.com/Flow-Fly/pixel-forge/issues/403)

**Investigated:** 2026-08-04

**Pixel Forge baseline:** [`origin/develop` at `d737ac4`](https://github.com/Flow-Fly/pixel-forge/tree/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c)

Store policies change frequently. The exact submission rules cited here were current on the investigation date and must be checked again before each beta or production submission.

## Decision

### What belongs in 1.0

Pixel Forge 1.0 should ship as the existing browser application and installable PWA:

- **desktop browser/PWA:** Complete Editor;
- **tablet browser/PWA:** Complete Editor with touch and pen as first-class input;
- **phone browser/PWA:** focused project access, preview, and bounded edits.

Store submission is **not** a web 1.0 release gate. A native mobile shell or Steam build should not delay a trustworthy web release.

However, the locked tablet promise makes physical-device proof a 1.0 gate. At minimum, the full editor must pass its agreed authoring journeys on a physical iPad in Safari and as a Home Screen web app, plus a representative physical Android tablet in Chrome and as an installed PWA. Phone-focused journeys need the same Safari/Chrome coverage. Simulators and responsive desktop viewports are useful diagnostics, not sufficient evidence for pen, gesture, memory, storage, files, keyboard, lifecycle, or safe-area behavior.

### What 1.0 must architect for

The web release should establish the seams later packages consume:

1. pointer, pen, and gesture behavior independent of mouse events;
2. adaptive Complete Editor and Phone Editor presentations without forking project/tool logic;
3. a capability adapter for files, sharing, clipboard, install state, lifecycle, and future purchases;
4. the existing portable project file and replaceable `ProjectRepository` boundary;
5. explicit storage budget, persistence request, quota failure, backup, and recovery behavior;
6. versioned storage/project migrations that survive PWA and packaged-app updates;
7. account, sync, and entitlements as optional server capabilities that never block local editing;
8. stable privacy, support, and account-deletion web URLs before a store beta;
9. a platform/build identity included in diagnostics without logging creative content;
10. one reproducible device journey suite that can later run against PWA and packaged shells.

These are architectural and verification requirements, not permission to add Capacitor, billing SDKs, native projects, or store metadata to 1.0.

### Packaging recommendation

- Keep **PWA** as the primary free distribution and fastest update channel.
- Use a **Capacitor 8 local-asset shell** for the first iOS/iPadOS and Android feasibility spike. Do not point a production shell at the live website.
- Do not choose Android **Trusted Web Activity** as the main mobile strategy. It is a viable low-native-integration Android-only fallback, but Pixel Forge needs stronger file, share, lifecycle, storage, and billing seams and must support Apple platforms from the same product code.
- Treat **Tauri versus Electron** as a later desktop-shell measurement, not a 1.0 framework decision. Prefer Tauri if Pixel Forge passes the full corpus across operating-system WebViews; use Electron if a bundled Chromium is required for rendering/API consistency. Either can produce the executable Steam requires.
- Attempt **one store pilot at a time** after the shell and billing contracts are proven. Do not build Apple, Google, and Steam commerce simultaneously.

## Current Pixel Forge evidence

### PWA foundation already exists

Pixel Forge is not starting from an ordinary website:

- Vite generates a standalone manifest with 192px, 512px, and maskable icons, relative start URL/scope, `.pf` and Aseprite file handlers, and a single-client launch handler.
- Workbox precaches the application shell and keeps future `/api` sync traffic network-only.
- Service-worker updates wait for the user rather than replacing the running editor mid-session.
- project files are local-first in IndexedDB through a `ProjectRepository` interface intended to support other repositories later;
- PWA file launches feed the normal project import service.

Sources:

- [`vite.config.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/vite.config.ts#L20-L80)
- [`pwa-registration.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/pwa-registration.ts)
- [`pwa-file-handling.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/pwa-file-handling.ts)
- [`project-repository.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/persistence/project-repository.ts)
- [`indexed-db.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/persistence/indexed-db.ts)

The manifest build has an automated contract test, but there is no current physical-device or offline-install journey in the inspected suite.

### Touch readiness is not complete

Some editor chrome uses Pointer Events, but the core drawing canvas, viewport panning, rulers, selection transform handles, and reference transform handles still bind mouse events. Responsive rules cover a few dialogs, menus, tabs, and the project browser rather than defining a complete tablet or phone shell.

Representative sources:

- [`pf-drawing-canvas.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/canvas/pf-drawing-canvas.ts#L677-L955)
- [`pf-canvas-viewport.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/canvas/pf-canvas-viewport.ts)
- [`pf-ruler.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/canvas/pf-ruler.ts)
- [`pf-transform-handles.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/canvas/pf-transform-handles.ts)

This confirms #382's unified Pointer Events and gesture foundation is prerequisite work, not mobile polish.

### Local persistence needs an explicit durability contract

The current repository does not request persistent browser storage, inspect quota, enforce the planned local budget, or provide a native repository. WebKit documents that browser storage is best-effort by default and can be evicted under storage pressure; it supports `StorageManager.estimate()`, `persisted()`, and `persist()` for web apps. Capacitor's own storage guide specifically warns that iOS may reclaim WebView IndexedDB and recommends database-grade storage for large persistent data.

Sources:

- WebKit: [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- Capacitor: [Data Storage in Capacitor](https://capacitorjs.com/docs/guides/storage)

Do not migrate product storage speculatively. For web 1.0, add observable quota/persistence and recoverable backup behavior around the current repository. For a native store release, the feasibility spike must prove IndexedDB survival across app update, OS kill, reboot, low-storage pressure, and restore. If it fails, implement a native durable repository behind the existing interface; do not scatter SQLite or filesystem calls through editor code.

## Delivery-path comparison

| Path | Product fit | Offline/runtime | Native integration | Distribution policy | Decision |
| --- | --- | --- | --- | --- | --- |
| Browser + PWA | One codebase; already implemented; no store gate | Service-worker shell plus IndexedDB; browser storage policy applies | Standards APIs with uneven platform coverage | Web distribution; no store review or store billing | **1.0 primary path** |
| Capacitor local shell | Reuses Vite/Lit app on iOS and Android | Compiled assets bundled in WKWebView/Android WebView; native storage still needs proof | Plugins/custom Swift/Kotlin for files, sharing, lifecycle, billing | App Store and Play review apply | **Preferred post-1.0 mobile shell** |
| Android Trusted Web Activity | Very thin Android package around owned PWA | Loads the verified web origin; offline/navigation failures can become app-visible crashes | Limited bridge compared with Capacitor | Play policy still applies | **Fallback or experiment, not primary** |
| Tauri desktop shell | Small bundle, narrow privileged commands | Bundled assets rendered by WebView2/WKWebView/WebKitGTK | Rust core and capability-scoped IPC | Direct download or Steam executable/depot | **Steam candidate if cross-WebView corpus passes** |
| Electron desktop shell | Larger bundle, predictable bundled Chromium | Bundled assets in Chromium; Node stays outside isolated renderer | Mature desktop APIs through context-isolated preload/IPC | Direct download or Steam executable/depot | **Fallback when renderer consistency wins** |

### PWA

Safari 26 allows any website to be added as a Home Screen web app; a manifest still supplies identity and icons, and a service worker still supplies Pixel Forge's offline shell. WebKit explicitly says there are now zero Safari installability requirements, which makes the PWA the lowest-friction Apple delivery path even though it has no App Store listing.

Sources:

- WebKit: [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- Google: [PWA assets, data, and offline readiness](https://web.dev/learn/pwa/assets-and-data/)

The PWA remains subject to browser feature variation. Pixel Forge's Chromium File Handling API cannot be the only way to import/export or recover a project. Every critical journey needs a standards or visible file-picker fallback.

### Capacitor

Capacitor is designed to add a native iOS/Android runtime to an existing modern web project. Version 8 supports iOS 15+ via WKWebView and Android API 24+ with an updatable WebView. Its configuration points `webDir` at compiled assets. The `server.url` option is explicitly for live reload and not production.

Sources:

- [Capacitor introduction](https://capacitorjs.com/docs)
- [configuration and local `webDir`](https://capacitorjs.com/docs/config)
- [iOS support](https://capacitorjs.com/docs/ios)
- [Android support](https://capacitorjs.com/docs/android)

Capacitor is therefore a good packaging seam, not proof that the web editor is mobile-ready. The first spike must package local build output and change no product behavior, backend contract, billing, or storage implementation unless evidence forces a separately approved follow-up.

### Trusted Web Activity

A Trusted Web Activity uses an Android package to present an owned PWA fullscreen. Google requires PWA installability and verified ownership; failures such as broken Digital Asset Links, an offline navigation without HTTP 200, or a 404/5xx can surface as a crash-like app failure. The Play policies still apply.

Source: Google, [Using a PWA in your Android app](https://web.dev/articles/using-a-pwa-in-your-android-app).

This path minimizes native code but does not serve Apple platforms and keeps runtime availability tied to the web origin/service worker. It is reasonable only if the product later decides it needs a Play listing with almost no native integrations.

### Tauri and Electron for desktop/Steam

Tauri uses the operating system WebView—WebView2 on Windows, WKWebView on macOS, and WebKitGTK on Linux—and keeps privileged work in a Rust core process. This produces a smaller package but preserves browser-engine variance. Tauri warns that changing the application scheme can change the IndexedDB/localStorage location, which is exactly the class of update hazard Pixel Forge must test.

Electron embeds Chromium and Node.js and renders the web UI in Chromium renderer processes. Its context-isolated preload/IPC design can expose a small file and lifecycle adapter without giving editor content direct Node access. The cost is a larger runtime plus a continuing Chromium/Electron security-update responsibility.

Sources:

- Tauri: [process model](https://v2.tauri.app/concept/process-model/), [WebView configuration and data directory warnings](https://v2.tauri.app/reference/javascript/api/namespacewebview/)
- Electron: [introduction](https://www.electronjs.org/docs/latest/), [process model](https://www.electronjs.org/docs/latest/tutorial/process-model), [security checklist](https://www.electronjs.org/docs/latest/tutorial/security)

Pixel Forge should not select on bundle size alone. Compare cold start, canvas latency, worker/OffscreenCanvas behavior, color rendering, memory, filesystem workflows, IndexedDB migration, screen-reader behavior, signing, and update ownership on clean Windows/macOS/Linux machines. Steam can distribute updates, but Pixel Forge still owns the wrapper and browser-engine security model.

## Apple App Store path

### Review fit

Apple guideline 4.2 requires utility and UI beyond a repackaged website. Pixel Forge's editor is substantive, but a remote-site WebView with desktop controls would create avoidable review risk. A credible package should bundle the editor, work offline, use the locked tablet/phone presentation, and integrate at least the system file picker/export/share flows needed by an art tool.

Apple also requires every app to link a privacy policy in App Store Connect and inside the app. Apps with account creation must offer in-app account deletion. If Pixel Forge adds third-party/social login, guideline 4.8 adds an equivalent privacy-preserving login requirement unless an exception applies.

Source: Apple, [App Review Guidelines 4.2, 4.8, and 5.1](https://developer.apple.com/app-store/review/guidelines/).

An Apple Developer Program membership is currently USD 99 per year and supplies certificates, profiles, TestFlight, App Store Connect, and StoreKit access. This is launch operations, not 1.0 architecture.

Source: Apple, [Developer Program membership details](https://developer.apple.com/programs/whats-included/).

### Paid sync

Paid cloud synchronization is digital app functionality. Apple's default rule 3.1.1 requires In-App Purchase to unlock in-app functionality. Rule 3.1.3(b) permits multiplatform access to purchases made elsewhere when the same features are also available as IAP. Rule 3.1.3(f) exempts a free standalone companion to a paid web tool only when there is no purchase or external purchase call-to-action in the app. External-link rights vary by storefront and entitlement.

Pixel Forge plausibly fits either the multiplatform-service rule or the free-companion rule, but only App Review can settle how the final UI and business model are classified. Do not base the architecture on receiving the companion exemption. The resilient plan is:

- keep the complete local editor free and usable without login;
- support Apple subscription products as a provider adapter if paid sync is marketed or purchasable in the app;
- allow existing entitlements only through the purchase/steering behavior currently permitted for each storefront;
- explain the business model and test account clearly in App Review notes;
- re-check guideline 3.1 and regional entitlements immediately before submission.

Apple's [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi) lets Pixel Forge's server verify signed transactions and subscription state independent of installation. The client must not be the entitlement authority.

## Google Play path

### Review fit and operational requirements

Google's current Developer Program Policy requires a stable, responsive, useful mobile experience. It rejects limited or broken functionality and unauthorized WebView wrappers. Pixel Forge owns its web content and offers real editing utility, but the package still needs physical evidence that drawing, saving, files, and lifecycle work as a mobile app.

Source: Google Play, [Developer Program Policy](https://support.google.com/googleplay/android-developer/answer/17190352?hl=en).

Current concrete gates include:

- a USD 25 one-time developer registration fee and identity/account verification;
- for personal accounts created after 2023-11-13, a closed test with at least 12 opted-in testers for 14 continuous days before applying for production access;
- Android 16/API 36 for new apps and updates beginning 2026-08-31, with policy timelines changing annually;
- a Data safety form and privacy policy even when the app collects no data;
- both an in-app path and a web resource for account deletion when the app creates accounts.

Sources:

- [Play Console registration](https://support.google.com/googleplay/android-developer/answer/6112435)
- [personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465)
- [target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-GB_ALL)
- [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
- [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)

### Paid sync

Google Play's payment policy explicitly includes cloud software and data-storage services among digital services that normally require Play Billing. Alternative billing or external-link programs exist only in eligible countries/regions and under additional enrollment terms; those programs are changing during 2026.

Source: Google Play, [Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en).

Use Play Billing as an entitlement provider for a Play-distributed app unless the exact launch region/program permits another path. Google recommends verifying and acknowledging purchases on a secure backend; unacknowledged purchases can be refunded. Real-time developer notifications are signals to query the Play Developer API, not entitlement truth by themselves.

Sources:

- Android Developers: [Fight fraud and abuse](https://developer.android.com/google/play/billing/security)
- Android Developers: [Integrate Play Billing with a backend](https://developer.android.com/google/play/billing/backend)

## Steam path

Steam explicitly accepts non-game software in Design & Illustration and Photo Editing, so Pixel Forge is a viable software product category. Steam distributes builds and depots, not a bare PWA URL; Pixel Forge needs a signed executable package and declared supported operating systems.

Sources:

- Steamworks: [Applications and software types](https://partner.steamgames.com/doc/store/application)
- Steamworks: [Getting started](https://partner.steamgames.com/doc/gettingstarted)

Current launch gates include:

- a USD 100 Steam Direct fee per app, recoupable after USD 1,000 adjusted gross revenue;
- identity, bank, tax, NDA, and Steam Distribution Agreement onboarding;
- a 30-day wait from paying the app fee for the first titles;
- a public Coming Soon page for at least two weeks;
- store-page and build review, for which Valve advises allowing at least seven business days;
- a build that starts on every declared OS and implements every advertised launch feature;
- Valve's public review checklist requires Steam Wallet for in-game transactions; how that rule applies to Pixel Forge software and paid sync must be confirmed under the executed agreement.

Sources:

- [Steam Direct fee](https://partner.steamgames.com/doc/gettingstarted/appfee)
- [onboarding and timing](https://partner.steamgames.com/doc/gettingstarted/onboarding)
- [release options](https://partner.steamgames.com/doc/store/types?language=english)
- [review process](https://partner.steamgames.com/doc/store/Review_Process)

Steam is not a free web-app listing. It needs a product decision:

- **free Steam app:** aligns with the free local editor, but paid sync transactions still need a Steam-compliant path;
- **paid convenience package:** can charge for desktop packaging/integration, but must not imply the web editor is incomplete or promise indefinite paid cloud cost from a one-time fee;
- **Steam subscription:** may align with recurring sync cost, but requires Steam commerce, cancellation, restoration, and cross-platform entitlement work.

Do not choose among these in the wrapper spike. Review the executed Steam Distribution Agreement and confirm with Valve how Pixel Forge's cross-platform sync subscription must use Steam Wallet before implementing commerce. If the Steamworks SDK is linked, audit all dependency licenses; Valve warns that some copyleft licenses are incompatible with its SDK distribution terms.

Source: Steamworks, [Distributing open-source applications](https://partner.steamgames.com/doc/sdk/uploading/distributing_opensource).

## Billing and entitlement architecture

The product contract is simple: the complete local editor is free; paid value begins with cloud persistence, synchronization, cross-device access, and durable cloud versions. The implementation cannot be a single `isPro` boolean sourced from whichever client made the purchase.

### Canonical server model

Define one server-owned entitlement record with at least:

- Pixel Forge account ID;
- capability such as `cloud_sync` and its plan/retention limits;
- purchase provider: web, Apple, Google Play, Steam, promotion, or support override;
- provider product ID and stable original transaction/purchase-token reference;
- active, grace, paused, expired, refunded, revoked, or disputed state;
- effective and expiry timestamps;
- last verified provider event/version;
- idempotency key and audit timestamps.

The exact schema belongs to the billing capability, but the rules belong in 1.0 planning:

- provider receipts/tokens are verified server-side;
- webhook/server-notification handling is idempotent and retryable;
- notification arrival triggers provider verification before entitlement mutation;
- refunds, revocations, grace periods, account relinking, and restore purchases are explicit;
- entitlement loss stops future cloud writes but does not hide or destroy local projects;
- the client receives capabilities, not provider-specific billing state;
- platform-specific purchase and management UI is selected by a capability adapter;
- a web subscriber is not forced to buy duplicate access, subject to each store's current rules;
- account deletion offers an export path and explains what happens to local versus cloud copies.

### Submission-safe first version

The lowest-risk first native beta has no purchase UI and proves the free local editor. Add account sign-in and paid sync only after privacy, deletion, entitlement, and store-billing flows exist together. A public store app that exposes paid sync purchased elsewhere without a reviewed policy path is not an acceptable shortcut.

## Physical-device evidence

### Web/PWA evidence required for 1.0

Run the agreed Complete Editor journey on:

- current Safari on a physical iPad, in-browser and Home Screen modes;
- current Chrome on a physical Android tablet, in-browser and installed modes;
- supported desktop Chrome/Edge, Safari, and Firefox where promised;
- current Safari on a physical iPhone and Chrome on a representative Android phone for the focused Phone Editor journeys.

Record device, OS/browser versions, input device, build SHA, project fixture, and pass/fail evidence for:

- cold and offline launch after a prior install;
- create, draw, erase, fill, pan, pinch zoom, undo/redo, save, close, reopen;
- pen pressure/hover only where promised; finger/pen arbitration and palm behavior;
- import/export and recovery without File Handling API support;
- background, foreground, OS kill, rotation, split view, keyboard open/close, and low-memory return;
- service-worker update while dirty projects are open;
- quota warning, failed save, export/backup, and recovery;
- representative large project playback and drawing latency;
- VoiceOver/TalkBack, keyboard, focus, zoom, reduced motion, and touch target review;
- portrait/landscape safe areas and system back/navigation behavior.

Performance and memory thresholds must be approved before the run; this research does not invent them.

### Native-shell evidence required before store beta

Repeat the same corpus in local-asset Capacitor builds on a physical iPad/iPhone and Android tablet/phone, adding:

- install, first launch, full offline launch, app update, uninstall/reinstall expectations;
- IndexedDB survival across restart/update/OS pressure, or the approved native repository migration;
- native file picker, share sheet, exported file location, and incoming file/deep link;
- WebView crash/restart and interrupted-save recovery;
- release-build CSP, logging, certificate/network errors, and server CORS from native origins;
- only requested permissions, with denial and later recovery;
- signed TestFlight/Play internal build install and review-account journey;
- purchase, pending purchase, restore, refund/revoke, offline entitlement cache, and cross-device sign-in once billing enters scope.

### Steam evidence required before review

- install and launch from a clean Steam account/machine in online and Offline Mode;
- every declared Windows/macOS/Linux build, or declare only the OS actually proven;
- file associations, open/save/export paths, high-DPI/multi-monitor behavior, sleep/resume, crash recovery, and updates;
- Steam overlay/shortcut interaction where applicable;
- the approved Steam commerce and entitlement-restore path if commerce is present;
- store screenshots and feature text match the reviewed build exactly.

## Viable packaging and release sequence

### Phase 0 — Web 1.0 foundations

1. Finish pointer/gesture and adaptive-presentation foundations.
2. Add storage estimate/persistence, the local budget, visible quota failure, backup, and recovery.
3. Finish the portable command/project/storage seams and build identity.
4. Publish stable privacy, support, and storage/recovery pages from #403.
5. Pass the physical PWA matrix and release web 1.0.

### Phase 1 — Mobile shell feasibility, no store submission

1. Add Capacitor in an isolated experiment using bundled Vite assets.
2. Add only the minimum file/share/lifecycle adapters needed to exercise critical journeys.
3. Run physical iOS/iPadOS and Android evidence, especially persistence and canvas performance.
4. Decide whether IndexedDB is sufficient or a native repository slice is required.
5. Remove or keep the experiment based on evidence; do not let a spike become production architecture by inertia.

### Phase 2 — One mobile beta channel

1. Choose Apple or Google as the pilot based on audience, available devices/testers, developer-account type, and owner preference.
2. Complete signing, privacy declarations, stable support/deletion URLs, screenshots, and review notes.
3. Ship the free local editor to TestFlight or Play internal testing first.
4. Resolve review feedback and device failures before beginning the second store.

Android is easier to iterate locally across varied hardware, but a new personal Play account may add the 12-tester/14-day production gate. iPad is the higher-priority proof surface because it promises the Complete Editor; that does not require Apple submission to happen first.

### Phase 3 — Paid sync and store commerce

1. Approve the entitlement domain model and account/deletion contract.
2. Implement and verify one provider adapter end to end.
3. Add the matching store purchase/restore/manage UI and server notifications.
4. Prove a web purchase and store purchase grant the same capability without duplicate-loss or destructive expiry behavior.
5. Add the second mobile store only after the first provider is operationally stable.

### Phase 4 — Desktop wrapper and Steam

1. Compare Tauri and Electron with the web 1.0 device/performance corpus.
2. Select one wrapper and one initial OS; avoid promising all desktop platforms before clean-machine proof.
3. Decide free, paid-package, or subscription positioning and obtain the Steam commerce answer.
4. Complete Steamworks onboarding, build/depot, store page, fee, waiting periods, and review.
5. Treat Steam Cloud/Steam identity as optional adapters; do not fork the Pixel Forge project or entitlement truth.

## Roadmap classification

### 1.0

- browser/PWA Complete Editor on desktop;
- browser/PWA Complete Editor on tablet with physical touch/pen evidence;
- focused Phone Editor in browser/PWA with physical evidence;
- input, presentation, capability, storage, migration, and device-test foundations listed above;
- stable privacy/support/storage-recovery URLs;
- no native wrapper, store SDK, store listing, production billing, or Steam requirement.

### Post-1.0

- Capacitor feasibility and native storage decision;
- TestFlight and Google Play internal/closed betas;
- App Store and Play production submissions;
- Apple, Google Play, and Steam billing provider adapters;
- Tauri/Electron desktop shell and Steam distribution;
- optional native integrations, Steam identity, or Steam Cloud based on real user value.

### Rejected directions for the current plan

- rewriting the editor in Swift, Kotlin, React Native, or Flutter without failed physical WebView evidence;
- serving the production website through Capacitor `server.url`;
- making App Store, Play, or Steam approval a web 1.0 gate;
- assuming IndexedDB is durable enough in a native WebView without update/pressure tests;
- trusting client purchase state as entitlement truth;
- hiding the free local editor behind account or network availability;
- implementing all three store billing stacks in parallel;
- calling a compressed desktop UI a tablet or phone experience.

## Decisions still required

- supported browser, OS, device, and stylus matrix for the 1.0 promise;
- exact Complete Editor tablet journeys and focused Phone Editor journeys;
- approved storage/performance budgets and low-storage behavior;
- whether a Capacitor shell keeps IndexedDB or adopts a native repository after the spike;
- first mobile beta/store and developer account type;
- account provider and whether social login triggers additional Apple login requirements;
- Apple classification: multiplatform subscription, free standalone companion, or another approved arrangement;
- eligible Google alternative-billing regions/programs at launch;
- Steam free, one-time paid, or recurring subscription positioning;
- Tauri versus Electron and initial Steam operating system;
- legal entity, privacy review, tax/bank setup, product license, and third-party notice ownership.

## Primary sources

- Pixel Forge: [PWA configuration](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/vite.config.ts), [project repository](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/persistence/project-repository.ts), [IndexedDB implementation](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/persistence/indexed-db.ts)
- WebKit: [Safari 26 web apps](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- Capacitor 8: [documentation](https://capacitorjs.com/docs), [configuration](https://capacitorjs.com/docs/config), [iOS](https://capacitorjs.com/docs/ios), [Android](https://capacitorjs.com/docs/android), [storage](https://capacitorjs.com/docs/guides/storage)
- Apple: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Developer Program](https://developer.apple.com/programs/whats-included/), [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi)
- Google Play: [Developer Program Policy](https://support.google.com/googleplay/android-developer/answer/17190352?hl=en), [Payments](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en), [target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-GB_ALL), [testing](https://support.google.com/googleplay/android-developer/answer/14151465), [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [billing security](https://developer.android.com/google/play/billing/security)
- Trusted Web Activity: [Google's PWA-to-Android guidance](https://web.dev/articles/using-a-pwa-in-your-android-app)
- Tauri: [process model](https://v2.tauri.app/concept/process-model/), [WebView API](https://v2.tauri.app/reference/javascript/api/namespacewebview/)
- Electron: [documentation](https://www.electronjs.org/docs/latest/), [process model](https://www.electronjs.org/docs/latest/tutorial/process-model), [security](https://www.electronjs.org/docs/latest/tutorial/security)
- Steamworks: [application types](https://partner.steamgames.com/doc/store/application), [onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding), [Direct fee](https://partner.steamgames.com/doc/gettingstarted/appfee), [release options](https://partner.steamgames.com/doc/store/types?language=english), [review](https://partner.steamgames.com/doc/store/Review_Process)
