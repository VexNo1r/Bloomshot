# Bloomshot: iPhone setup through TestFlight and release

Checked October 15, 2026 against the repository and linked primary documentation. Trevor confirms no developer/store/RevenueCat accounts are started and has chosen **Individual enrollment under his personal legal name**. The game remains **Bloomshot**, bundle ID **dev.bloomshot.game**. Downloads are planned to be free, with purchases inside the app.

## 1. Free playtest and merge checkpoints

Open the private web build in Safari with the owner's access. Paid Apple membership is not required for web play. Record **Model Name** and **iOS Version** from Settings → General → About. Test aiming, the tutorial, bosses, bottom power row, sound and background motion.

Trevor may merge green, reviewed **PR #30 first**. Hold **PR #31** until he approves the latest game and its checks pass. Merge both into main before a release archive; the archive needs the new game's offline policy. Confirm main's commit before building. No merge or upload is public-release approval.

## 2. Apple Account and Individual enrollment

1. Use the Apple Account intended to own Bloomshot. Keep its legal name/contact details current.
2. Check two-factor authentication in iPhone Settings → your name → Sign-In & Security → Two-Factor Authentication.
3. Open Apple's [enrollment page](https://developer.apple.com/programs/enroll/) or its Developer app and start **Apple Developer Program → Individual**.
4. Trevor personally completes identity verification, reads/accepts the agreement and pays the membership fee shown. Apple's current price is US$99 per year, with regional pricing at checkout. Wait for active membership before signing setup. [Apple membership instructions](https://developer.apple.com/help/account/membership/program-enrollment/), [iPhone enrollment](https://developer.apple.com/help/account/membership/enrolling-in-the-app/).

Individual enrollment displays the personal legal name as the App Store seller; the app name can still be Bloomshot. A Harborline contact email does not make an Organization enrollment. If Trevor later chooses an incorporated legal entity instead, stop and review Apple's Organization requirements, including authority verification and a D-U-N-S Number where required; do not select that route automatically.

## 3. Register the ID and create the app record

1. At [Apple Developer Account](https://developer.apple.com/account/), open **Certificates, Identifiers & Profiles → Identifiers → + → App IDs**.
2. Register an **explicit** Bundle ID **dev.bloomshot.game**, description **Bloomshot**. In-App Purchase is enabled by default for explicit App IDs; do not add unrelated capabilities. If the ID is unavailable, resolve ownership with Trevor before changing native code. [App ID steps](https://developer.apple.com/help/account/identifiers/register-an-app-id/).
3. Open [App Store Connect](https://appstoreconnect.apple.com/), accept the current account agreement if prompted, then **Apps → + → New App**.
4. Choose **iOS**, name **Bloomshot**, the game's English primary language, that Bundle ID and a unique internal SKU, for example **bloomshot-ios-1**. Review user access and click **Create**. The SKU is an internal reference, not a player-facing name. Creating the record does not publish it. [Apple app-record steps](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/).

The iOS record covers this project's iPhone/iPad app. Keep the app's download price Free. Use the Games category; do not opt into Kids positioning. Complete age-rating/privacy forms from the actual content and SDK configuration.

## 4. Create signing files on the owner's trusted computer

The workflow needs an exportable **Apple Distribution** identity: certificate **and matching private key** inside a password-protected P12. A .cer alone cannot sign. Development or Developer ID certificates are different types. [Apple certificate types](https://developer.apple.com/help/account/certificates/certificates-overview/).

Apple's documented CSR route uses Keychain Access on a Mac. Create the request, issue Apple Distribution in the developer portal, then export the certificate with its private key to P12. Keep the originals/password securely. [Apple CSR guide](https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request/).

### Windows alternative: owner-operated local steps

Git's OpenSSL executable exists on this laptop at **C:\Program Files\Git\usr\bin\openssl.exe**. These instructions are prepared, **not run with Trevor's private key or Apple account**. Work in a new private folder outside the Git checkout. Do not replace an existing signing identity blindly.

```powershell
$signTool = 'C:\Program Files\Git\usr\bin\openssl.exe'
& $signTool req -new -newkey rsa:2048 -sha256 -keyout 'Bloomshot-distribution.key' -out 'Bloomshot-distribution.csr'
```

Enter a strong key passphrase and truthful subject details when prompted. Leave optional challenge-password/company fields empty unless required. Keep the encrypted key local. Upload **only the CSR** at Apple Developer Account → Certificates → + → **Apple Distribution**. Download the resulting certificate as **distribution.cer**. This applies OpenSSL's documented [CSR/key options](https://docs.openssl.org/3.0/man1/openssl-req/) to Apple's request step.

Convert the DER certificate and package it with that same private key:

```powershell
& $signTool x509 -inform DER -in 'distribution.cer' -out 'distribution.pem'
& $signTool pkcs12 -export -inkey 'Bloomshot-distribution.key' -in 'distribution.pem' -out 'Bloomshot-distribution.p12' -name 'Bloomshot Apple Distribution'
```

Enter the existing key passphrase and a new P12 export password at the prompts, never as command arguments. If format/key pairing fails, diagnose that error instead of repeatedly generating replacements. [Certificate conversion](https://docs.openssl.org/3.0/man1/openssl-x509/), [P12 export](https://docs.openssl.org/3.0/man1/openssl-pkcs12/).

In Apple Developer Account → **Profiles → +**, choose **App Store Connect** under Distribution, select **dev.bloomshot.game** and the matching certificate, name/generate the profile and download its **.mobileprovision**. Find the ten-character Team ID in Membership details. The workflow refuses expired, wildcard, development/ad hoc/enterprise and mismatched profiles. [Distribution profile steps](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/).

## 5. Add the four signing secrets

In **GitHub → VexNo1r/Bloomshot → Settings → Secrets and variables → Actions → New repository secret**, add:

| Exact name | Owner supplies |
|---|---|
| IOS_TEAM_ID | Ten-character Apple Team ID |
| IOS_DISTRIBUTION_CERTIFICATE_BASE64 | Base64 of the P12 containing certificate/private key |
| IOS_CERTIFICATE_PASSWORD | P12 export password |
| IOS_PROVISIONING_PROFILE_BASE64 | Base64 of the matching .mobileprovision |

Base64 is encoding, not encryption. In the private signing folder, this Windows command copies file bytes as base64 without printing them:

```powershell
Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path -LiteralPath '.\Bloomshot-distribution.p12').Path)))
```

Paste directly into the appropriate GitHub secret. Repeat using the profile's actual filename. Never place private key material/passwords in chat, source control, an issue or a PR.

## 6. Export first, with upload unchecked

1. Confirm both PRs are merged and **main** contains the approved game and **bloomshot/privacy.html**.
2. GitHub → Actions → **iOS release archive → Run workflow**, branch **main**.
3. Enter version, initially **1.0**, and a fresh numeric build number **1–9999**, greater than prior uploads for that version. The workflow does not ask Apple to allocate numbers.
4. Leave **upload_to_app_store_connect unchecked** for the first signing run. Only a manual main run signs; branch runs are skipped.
5. The macOS runner checks Xcode 26+, installs pinned dependencies, syncs/checks assets, verifies identity/profile and signs only the App Release target. A successful run retains **.xcarchive**, **.ipa** and **ReleaseMetadata.json** for **14 days**. Download and inspect bundle ID, source commit, version/build.

The App Store IPA is for Apple delivery, not an arbitrary phone's ad hoc installation. Export-only uploads/submits nothing. Normal success/failure cleanup removes the temporary keychain, imported profile and decoded signing/upload keys; artifacts exclude private signing files. Abrupt runner termination is beyond the cleanup handler's proof.

Synthetic validation covers preflight/profile checks and signing changes on a copied project. Real signing, Xcode Release export and upload remain unverified until owner credentials are used successfully.

## 7. Optional upload key, then upload a new build

In **App Store Connect → Users and Access → Integrations → App Store Connect API**, the Account Holder requests access. After approval, choose **Team Keys → Generate API Key**, with an upload-capable role such as Developer. Download the .p8 once and retain its Key ID and issuer UUID. Team keys apply across the team's apps according to the role; this workflow expects a **team key**. [Apple API-key setup](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/).

Add:

| Exact GitHub secret | Value |
|---|---|
| APP_STORE_CONNECT_API_KEY_ID | Ten-character upload key ID |
| APP_STORE_CONNECT_API_ISSUER_ID | Team issuer UUID |
| APP_STORE_CONNECT_API_KEY_BASE64 | Base64 of that upload key's .p8 |

Run the archive again on main with a **new build number** and upload selected. It validates/uploads with **xcrun altool** and records command completion. Confirm processing and the build in App Store Connect; command success is not review approval or publication. Exported artifacts remain available if optional upload fails. [Apple upload/processing](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/).

## 8. Install through a private TestFlight group

After processing, open **Apps → Bloomshot → TestFlight** and complete the build's compliance/testing information. Under **Internal Testing → +**, create an owner group, leave automatic distribution off during validation, add the intended build and invite Trevor's eligible account. Install Apple's TestFlight app on the iPhone and accept the invitation. Internal testers are eligible App Store Connect users. [Internal tester steps](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/).

Use an external group only after owner checks and authorization. The first external build requires TestFlight App Review. Do not create a public invitation link or notify others automatically. [External testing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/).

## 9. Set up purchases separately

Trevor completes **Business → Agreements → Paid Apps Agreement**, required tax forms and banking. The agreement must be active for Apple's real sandbox IAP testing. Membership and a free-game beta do not configure payment. [IAP prerequisites](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/), [banking](https://developer.apple.com/help/app-store-connect/manage-banking-information/enter-banking-information/).

Follow [Product setup](store/PRODUCT-SETUP.md) and [Sandbox test plan](store/SANDBOX-TEST-PLAN.md) from the separate game update. Verify the submitted Xcode App target's **In-App Purchase** capability and Swift 5+ as required by [RevenueCat's Capacitor setup](https://www.revenuecat.com/docs/getting-started/installation/capacitor). A missing capability marker in a text search is a setup check, not proof of a failed purchase.

| Distinct credential | Destination |
|---|---|
| Upload **team API** .p8 | GitHub upload secrets above |
| Apple **In-App Purchase** .p8 and issuer | RevenueCat Apple-app setup; not the upload key |
| RevenueCat **public iOS SDK key** | Reviewed app configuration; never a private Apple .p8 |

Use a TestFlight-only configuration with one product enabled to test it. Keep unverified production products disabled. TestFlight transactions use Apple's sandbox; dedicated sandbox controls have separate account/device instructions. Follow Apple's current sign-in steps and confirm the sandbox environment. [Sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox).

Approved USD targets: **$0.29 single**, **$0.49 for five of one kind**, **$1.00 for twenty mixed, five of each**. Verify actual store choices; get Trevor's decision if a target is unavailable. The new mixed product is **bloomshot.pack.bag20**; retired bag12 is not offered and saved grants keep their original contents. Other unlock prices remain as approved.

Record displayed price/currency, exact contents, cancellation, repeat taps, interrupted/pending confirmation, restore/refund handling, whole-pack capacity and exactly-once delivery after relaunch. No real purchase is verified yet. Apple's first IAP submission accompanies an app version. [IAP review/setup](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/).

## 10. Record the device result, then approve submission

Record source commit, build/version, model/iOS, tester and date. Check:

- First-run tutorial/replay; touch drag/release/cancel, petal turn, Split and free powerups; bottom row reachable around tutorial cards and safe areas.
- Levels 1–4, level-5 taste, Garden, Moon and free Koi pools. Later native levels require sandbox ownership; the web review query never bypasses native purchases.
- Boss tells/flower changes, busy waves/finale, sustained frame pacing and heat.
- Sound/music, first gesture, headphones/silent-switch behavior, interruptions, lock/unlock and background/return.
- Offline cold launch, Settings policy, save/settings after relaunch and native backup recovery. Reinstall is separate; local progress/spent consumables are not promised to restore.
- Supported iPad layouts/orientations and required media; Trevor's iPhone alone cannot verify iPad.

Policy: **hello@harborlineleadrecovery.com**, effective **October 14, 2026**. Verify the in-app copy and public submission URL. Finish accurate listing/media, age rating, privacy, compliance/export and review notes using the actual build/SDK setup. Trevor approves App Review submission and release method. TestFlight does not mean public availability or revenue.
