# Zoiper5 RPC API wrapper

A library for managing the communication between the client and the Zoiper5 RPC API server.

## Installation

### Package manager

Using npm:

```sh
npm install zoiper5-rpc-api-js-wrapper
```

Using yarn:

```sh
yarn add zoiper5-rpc-api-js-wrapper
```

#### Importing

Once installed, it can be imported as either ECMAScript or CommonJS module.

Using ECMAScript module:

```js
import {RPCManager, ConnectionManager} from 'zoiper5-rpc-api-js-wrapper';
```

Using CommonJS module:

```js
const {RPCManager, ConnectionManager} = require('zoiper5-rpc-api-js-wrapper');
```

### Script element

This library depends on `simple-jsonrpc-js` which needs to be included first.

Using jsDelivr CDN (UMD):

```html
<script src="https://cdn.jsdelivr.net/npm/simple-jsonrpc-js@1/dist/simple-jsonrpc-js.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/zoiper5-rpc-api-js-wrapper/dist/zoiper5-rpc-api-js-wrapper.umd.js"></script>
```

Using unpkg CDN (UMD):

```html
<script src="https://unpkg.com/simple-jsonrpc-js@1/dist/simple-jsonrpc-js.min.js"></script>
<script src="https://unpkg.com/zoiper5-rpc-api-js-wrapper/dist/zoiper5-rpc-api-js-wrapper.umd.js"></script>
```

Exports are available under the `Z5RPC` namespace:

```js
const {RPCManager, ConnectionManager} = Z5RPC;
```

It's also possible to use [the ECMAScript module](dist/zoiper5-rpc-api-js-wrapper.esm.js) with the help of [import maps](https://github.com/WICG/import-maps).

## Usage

```js
const rpcManager = new RPCManager({
  // Check Zoiper5 API's documentation about `Phone.registerCallback` and `Callbacks` for more information on callback names and signatures.
  'callback-name-1': fn1,
  'callback-name-2': fn2,
});
const connectionManager = new ConnectionManager(rpcManager, {
  url: '<rpc_server_url>',
});
connectionManager.onClose = () => {
  console.log('connection closed');
};

try {
  // Connect to the RPC server.
  await connectionManager.openConnection();
  // Obtain a reference to the instance of class `Phone`.
  const zoiperAPI = await rpcManager.initialize('api-token');
  // Do something with the `Phone` instance...
  console.log('application version:', await zoiperAPI.versionPhone);
  // Close the RPC server connection.
  connectionManager.closeConnection();
} catch (ex) {
  console.error('something went wrong...');
}
```

## TypeScript

This library provides TypeScript definitions, but it doesn't provide such for Zoiper5 API itself. You can provide your own:

```ts
interface Phone {
  versionPhone: Promise<string>;
}

const rpcManager = new RPCManager<Phone>({});
const zoiperAPI = await rpcManager.initialize('api-token');
zoiperAPI.versionPhone; // `Promise<string>`
zoiperAPI.nonexistent; // `Property 'nonexistent' does not exist on type 'Phone'. ts(2339)`
```

## Examples

Obtain the source code, and check [examples/](examples/) for a list of examples and their respective `README.md` file for more information about them.

## License

[MIT](LICENSE)
