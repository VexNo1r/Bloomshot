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
      // The Complete Garden is everything paid in one purchase: $6.99 against $9.97 for the three bought separately.
      { id: 'bloomshot.bundle.complete1', entitlements: ['levels_full', 'world_koi', 'style_collection1'], kind: 'bundle', title: 'Complete Garden', priceHint: '$6.99', available: false },
      // Powerups: consumables, bought again and again. A single grants `count` of `power` into the player's save through
      // BloomStore.onConsumable and is attached to no entitlement. $0.25 on Google Play; Apple's
      // lowest price is $0.29, so that is the App Store price. The game always shows the store's own price.
      { id: 'bloomshot.power.sunburst', consumable: true, power: 'sunburst', count: 1, kind: 'power', title: 'Sunburst', priceHint: '$0.25', available: false },
      { id: 'bloomshot.power.lullaby', consumable: true, power: 'lullaby', count: 1, kind: 'power', title: 'Lullaby', priceHint: '$0.25', available: false },
      { id: 'bloomshot.power.dandelion', consumable: true, power: 'dandelion', count: 1, kind: 'power', title: 'Dandelion', priceHint: '$0.25', available: false },
      { id: 'bloomshot.power.beeline', consumable: true, power: 'beeline', count: 1, kind: 'power', title: 'Bee Line', priceHint: '$0.25', available: false },
      // Powerup packs: fixed contents, always shown, nothing random. Five of one kind for $0.99, or the bag with three
      // of each (twelve) for $1.99. Each purchase is one grant: the game adds all of it under one transaction.
      { id: 'bloomshot.pack.sunburst5', consumable: true, power: 'sunburst', count: 5, kind: 'power', title: '5 Sunbursts', priceHint: '$0.99', available: false },
      { id: 'bloomshot.pack.lullaby5', consumable: true, power: 'lullaby', count: 5, kind: 'power', title: '5 Lullabies', priceHint: '$0.99', available: false },
      { id: 'bloomshot.pack.dandelion5', consumable: true, power: 'dandelion', count: 5, kind: 'power', title: '5 Dandelions', priceHint: '$0.99', available: false },
      { id: 'bloomshot.pack.beeline5', consumable: true, power: 'beeline', count: 5, kind: 'power', title: '5 Bee Lines', priceHint: '$0.99', available: false },
      { id: 'bloomshot.pack.bag12', consumable: true, powers: { sunburst: 3, lullaby: 3, dandelion: 3, beeline: 3 }, kind: 'power', title: 'Powerup Bag', priceHint: '$1.99', available: false }
    ]
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
