# PIVX-Promos

A decentralised, extensible and UX-friendly blockchain promo-code system.

## Features

- No dependencies.
- Lightweight (under 10 KBs uncompressed).
- [NPM package](https://www.npmjs.com/package/pivx-promos) available: `npm i pivx-promos`.
- Simple API scheme, with a focus on use in `Workers` or Threads.
- Built-in EventEmitter for checking progress of deriving a Promo Code's private key.

## How does it work?

The system uses a recursive SHA256 hashing algorithm to derive a private key from a string (the promo code!), this works by using a hardcoded "target", this target is the number of iterations required until a Promo Code is considered derived, this is used to determine the level of security, as the more iterations required, the harder it is to brute-force the hash.

The nature of this means the PIVX-Promos maintainers will periodically adjust the `target` to ensure the system remains secure from mass brute-forcing, while also remaining usable on low-power devices like Mobiles or SBCs.

By using a cryptographic hashing algorithm like SHA256 in a recursive fashion, it ensures that it is impossible to reverse-engineer the private key from the hash value (unlike [Brain Wallets](https://www.coindesk.com/tech/2020/10/14/brainwallets-the-bitcoin-wallet-you-probably-shouldnt-use-unless-you-have-to/)), additionally, making it impossible to multi-thread the hashing of a single Promo Code.

PIVX Promos avoid the pitfalls of [Brain Wallets](https://www.coindesk.com/tech/2020/10/14/brainwallets-the-bitcoin-wallet-you-probably-shouldnt-use-unless-you-have-to/) and script [malleability](https://en.bitcoin.it/wiki/Transaction_malleability), while only having a single minor drawback: a Create or Redeem time between 20-60 seconds.

## APIs

- `class` **PromoCode(code: string)**: This is the main class of the library. It is used to create new promo codes. It accepts a single string parameter when creating a new instance of the class, which can either be a UUID-like code string, or human readable text.
- - `EventEmitter` **progressEmitter**: An event emitter that is called during the process of deriving a Promo Code's private key. It emits the `deriveProgress` event containing an object with two properties:
- - - `number` **progress**: which represents the percentage completion of the process.
- - - `number` **eta**: which represents the estimated seconds remaining until completion.
- - `async function` **derivePrivateKey(privatePrefix: number)**: Starts the derivation of a Promo Code's private key, it accepts an optional byte number for the coin's private key prefix. Once the private key has been derived, it returns an object containing the private key in raw bytes and WIF format:
- - - `Uint8Array(32)` **bytes**: The unprocessed bytes of the Promo Code's private key.
- - - `string` **wif**: The network-encoded WIF key of the Promo Code.

## Examples


#### Single-threaded Promo Code Derivation
> Create a `"HappyEaster23"` Promo Code on a single blocked thread, logging the progress and ETA to the console, and displaying the WIF of the Promo Code once finished.

```js
// Import the PromoCode class from the pivx-promos library
import { PromoCode } from 'pivx-promos';

// Create a new PromoCode instance with the code "HappyEaster23"
const promo = new PromoCode('HappyEaster23');

// Set up an event listener for the 'deriveProgress' event emitted by promo.progressEmitter
promo.progressEmitter.on('deriveProgress', ({ progress, eta }) => {
    // Log the current progress and estimated time remaining to the console
    console.log(`Deriving private key... ${progress}% complete. ETA: ${eta.toFixed(1)} seconds`);
});

// Call the derivePrivateKey method of the PromoCode instance and wait for it to resolve
promo.derivePrivateKey().then(cWallet => {
    // Once the private key has been derived, log it to the console
    console.log('Promo Code Private Key: ' + cWallet.wif);
});
```

## Implementation Notes:
- The library user is expected to handle Public Key derivation themselves.
- The library user must take care of Promo Code backwards compatibility upon `Target` primitive updates.
- The library user may use another coin/network by specifying a Prefix Byte in `.derivePrivateKey(byte)`.