// Purchase catalog and store settings. Pure data: edit this file, not store.js.
// RevenueCat public SDK keys are safe to ship in the app; leave them empty until the accounts exist.
// Nothing here is live. A product with available:false cannot be bought, so unbuilt content is never sold.
(function (root) {
  'use strict';
  root.BloomStoreConfig = {
    revenueCatKeys: { ios: '', android: '' },
    // Hostnames (besides localhost) where the simulated store may run, e.g. a private staging site.
    mockHosts: [],
    products: [
      // id must match the product id created in App Store Connect and Google Play Console.
      // entitlement must match the entitlement id created in the RevenueCat dashboard.
      { id: 'bloomshot.world.koi', entitlement: 'world_koi', kind: 'world', title: 'Koi Conservatory', priceHint: '$4.99', available: false },
      { id: 'bloomshot.style.collection1', entitlement: 'style_collection1', kind: 'style', title: 'Keepsake Collection', priceHint: '$1.99', available: false },
      // The campaign has ten levels; levels 1 to 4 are free and this one-time purchase opens levels 5 to 10.
      { id: 'bloomshot.levels.full', entitlement: 'levels_full', kind: 'levels', title: 'Levels 5 to 10', priceHint: '$2.99', available: false },
      // A bundle is its own store product that grants several entitlements: in RevenueCat, attach this one product
      // to every entitlement listed here. Keep its price below the sum of the items, or it is not a bundle.
      // Never offer it to a player who already owns one of its items (the store refuses it as 'partly-owned').
      { id: 'bloomshot.bundle.launch1', entitlements: ['world_koi', 'style_collection1'], kind: 'bundle', title: 'Launch Bundle', priceHint: '$5.99', available: false }
    ]
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
