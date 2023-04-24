import { createHash } from 'crypto';
import EventEmitter from "events";

/* Constants */
/** Length of a private key pre-checksum */
export const pkNetBytesLen = 34;

/** The target hash depths at which a private key is derived, the last entry is the current depth.
 * 
 * The Target is updated periodically to match 30 seconds based on the speed of modern hardware;
 * this is what keeps PIVX-Promos secure, as without a target, or with a too low target, Promos
 * would be very easy to brute force.
 * 
 * A history of targets is kept to keep backwards-compatibility; if the newest target was not found, then
 * the client can work backwards to check older targets for derived Promo keys and balances.
 */
export const arrTargets = [
    12500000
];

// Base58 Encoding Map
export const MAP_B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * ByteArray to Base58 String
 * @param {Uint8Array} B
 * @returns {string} - Base58 string
 */
const to_b58 = function (B) {
    var d = [],    //the array for storing the stream of base58 digits
        s = "",    //the result string variable that will be returned
        i,         //the iterator variable for the byte input
        j,         //the iterator variable for the base58 digit array (d)
        c,         //the carry amount variable that is used to overflow from the current base58 digit to the next base58 digit
        n;         //a temporary placeholder variable for the current base58 digit
    for (i in B) { //loop through each byte in the input stream
        j = 0,                           //reset the base58 digit iterator
        c = B[i];                        //set the initial carry amount equal to the current byte amount
        s += c || s.length ^ i ? "" : 1; //prepend the result string with a "1" (0 in base58) if the byte stream is zero and non-zero bytes haven't been seen yet (to ensure correct decode length)
        while (j in d || c) {            //start looping through the digits until there are no more digits and no carry amount
            n = d[j];                    //set the placeholder for the current base58 digit
            n = n ? n * 256 + c : c;     //shift the current base58 one byte and add the carry amount (or just add the carry amount if this is a new digit)
            c = n / 58 | 0;              //find the new carry amount (floored integer of current digit divided by 58)
            d[j] = n % 58;                //reset the current base58 digit to the remainder (the carry amount will pass on the overflow)
            j++                          //iterate to the next base58 digit
        }
    }
    while (j--) //since the base58 digits are backwards, loop through them in reverse order
        s += MAP_B58[d[j]]; //lookup the character associated with each base58 digit
    return s; //return the final base58 string
}

/* --- UTILS --- */
/**
 * Writes a sequence of bytes into a location within a Uint8Array
 * @param {Uint8Array} arr - Array to write to
 * @param {Uint8Array} bytes - Bytes to write to the array
 * @param {number} pos - Position to start writing from
 */
export function writeToUint8(arr, bytes, pos) {
    const arrLen = arr.length;
    let i = 0;
    while (pos < arrLen) arr[pos++] = bytes[i++];
}

/**
 * Perform a double-SHA256 hash
 * @param {Uint8Array} data - Data to hash
 * @returns {Buffer} - The Hash
 */
export function dSHA256(data) {
    return createHash("sha256").update(createHash("sha256").update(data).digest()).digest();
}

/* --- HIGH-LEVEL FUNCTIONS --- */

/**
 * The resulting private key data derived from a Promo Code
 * @typedef {Object} PromoKey
 * @property {Uint8Array} bytes - The Private Key bytes.
 * @property {string} wif - The WIF encoded private key string.
 */

/**
 * Network Encode a private key from raw bytes
 * @param {Uint8Array} pkBytes - 32 Bytes
 * @param {number} privatePrefix - One-byte WIF network prefix
 * @returns {PromoKey}
 */
export function encodePrivkey(pkBytes, privatePrefix = 212) {
    // Private Key Constants
    const pkNetBytesLen = pkBytes.length + 2;
    const pkNetBytes = new Uint8Array(pkNetBytesLen);

    // Network Encoding
    pkNetBytes[0] = privatePrefix; // Private key prefix (1 byte)
    writeToUint8(pkNetBytes, pkBytes, 1); // Private key bytes  (32 bytes)
    pkNetBytes[pkNetBytesLen - 1] = 1; // Leading digit      (1 byte)

    // Double SHA-256 hash
    const shaObj = dSHA256(pkNetBytes);

    // WIF Checksum
    const checksum = shaObj.slice(0, 4);
    const keyWithChecksum = new Uint8Array(pkNetBytesLen + checksum.length);
    writeToUint8(keyWithChecksum, pkNetBytes, 0);
    writeToUint8(keyWithChecksum, checksum, pkNetBytesLen);

    // Return both the raw bytes and the WIF format
    return { bytes: pkBytes, wif: to_b58(keyWithChecksum) };
}

/**
 * Represents one on-chain promo code, it's keys and state.
 * @class
 */
export class PromoCode {
    /**
     * Creates a new instance of the PromoCode class.
     * @constructor
     * @param {string} code - The cleartext 'Promo Code'
     */
    constructor(code) {
        this.code = code;
        this.progressEmitter = new EventEmitter();
    }

    /**
     * The cleartext 'Promo Code' 
     * @type {string}
     */
    code = '';

    /**
     * The progress and ETA event emitter, sent each 1% of derive progress
     * @type {EventEmitter}
     */
    progressEmitter;

    /**
     * Derive a private key from the Promo Code (for Creation or Redemption)
     */
    async derivePrivateKey() {
        // Convert the string 'Promo Code' to a Uint8Array byte representation
        let arrByteCode = (new TextEncoder()).encode(this.code);

        // Prepare hashing, performance and emitter data
        const target = arrTargets[arrTargets.length - 1];
        let i = 0;
        let lastTime = Date.now();
        const times = []; // A 10-entry rolling average of the time diff between reports
        const updateInterval = Math.ceil(target / 100); // Update progress every 1% of target

        // Recursively hash until our target is hit
        while (i < target) {
            arrByteCode = createHash("sha256").update(arrByteCode).digest();
            i++;

            // Send progress updates every updateInterval iterations
            if (i % updateInterval === 0) {
                // Track progress percentage
                const progress = Math.floor(i / (target / 100));

                // Track timing averages
                const currentTime = Date.now();
                const timeDiff = currentTime - lastTime;
                times.push(timeDiff);
                if (times.length > 10) times.unshift();
                const avgTimePerIteration = times.reduce((a, b) => a + b) / times.length / updateInterval;
                const eta = (target - i) * avgTimePerIteration * 0.001;
                lastTime = currentTime;

                // Emit Progress to the receiver
                this.progressEmitter.emit('deriveProgress', { progress, eta });
            }
        }

        // Encode the millionth hash as a WIF Private Key (the 'wallet' of the Promo Code)
        const cWallet = encodePrivkey(arrByteCode);

        // Return it!
        return cWallet;
    }
}