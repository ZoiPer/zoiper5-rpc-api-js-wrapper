import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {RPCManager} from '../src/rpc-manager';

chai.use(chaiAsPromised);

const expect = chai.expect;

interface IdCounter {
  request(): number;
  response(): number;
}

function setupIdCounter(start: number = 1): IdCounter {
  let currentRequest = start;
  let currentResponse = start;

  return {
    request() {
      return currentRequest++;
    },
    response() {
      return currentResponse++;
    },
  };
}

interface Exchange {
  type: 'in' | 'out';
  payload: Record<string, unknown>;
}

function setupTest(rpcManager: RPCManager, exchanges: Exchange[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const sendResponseIfNeeded = () => {
      if (exchanges.length === 0) {
        // Wait for a potential last-moment rejection
        setTimeout(resolve, 0);
      } else {
        if (exchanges[0].type === 'in') {
          setTimeout(() => {
            const exchange = exchanges.shift()!;
            rpcManager.processMessage(JSON.stringify({jsonrpc: '2.0', ...exchange.payload}));
            sendResponseIfNeeded();
          }, 0);
        }
      }
    };
    rpcManager.sendMessage = (message: string): void => {
      try {
        const exchange = exchanges.shift();
        const expectedPayload = JSON.parse(message);
        delete expectedPayload.jsonrpc;
        expect(exchange).to.be.deep.equal({type: 'out', payload: expectedPayload});
        sendResponseIfNeeded();
      } catch (ex) {
        reject(ex);
        throw ex;
      }
    };
  });
}

describe('RPCManager', () => {
  it('throws error on authentication failure', async () => {
    const rpcManager = new RPCManager({});
    const outgoingCounter = setupIdCounter();
    const finishedPromise = setupTest(rpcManager, [
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'authenticate', params: ['invalid token']}},
      {type: 'in', payload: {id: outgoingCounter.response(), error: 'Access denied.'}},
    ]);
    await expect(rpcManager.initialize('invalid token')).to.eventually.be.rejected;
    await finishedPromise;
  });

  it('initializes', async () => {
    const rpcManager = new RPCManager({});
    const outgoingCounter = setupIdCounter();
    const finishedPromise = setupTest(rpcManager, [
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'authenticate', params: ['valid token']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'getRootObject'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['foo']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['bar']}},
    ]);
    const rootObject = await rpcManager.initialize('valid token');
    // `Assertion.to.have.property` has side effects on getters
    expect('foo' in rootObject).to.be.true;
    expect('bar' in rootObject).to.be.true;
    expect('baz' in rootObject).to.be.false;
    await finishedPromise;
  });

  it('initializes with global callbacks', async () => {
    const fn1 = () => {};
    const fn2 = () => {};
    const rpcManager = new RPCManager({
      foo: fn1,
      bar: fn2,
      baz: fn2,
    });
    const outgoingCounter = setupIdCounter();
    const finishedPromise = setupTest(rpcManager, [
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'authenticate', params: ['valid token']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'getRootObject'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: []}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['registerCallback']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [
        {type: 'scriptObject', scriptObject: 123},
        'registerCallback',
        'foo',
        {type: 'scriptObject', scriptObject: 1},
      ]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 0}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [
        {type: 'scriptObject', scriptObject: 123},
        'registerCallback',
        'bar',
        {type: 'scriptObject', scriptObject: 2},
      ]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 0}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [
        {type: 'scriptObject', scriptObject: 123},
        'registerCallback',
        'baz',
        {type: 'scriptObject', scriptObject: 2},
      ]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 0}},
    ]);
    await rpcManager.initialize('valid token');
    await finishedPromise;
  });

  it('executes global callbacks', async () => {
    let hasBeenCalled = false;
    const rpcManager = new RPCManager({
      foo() {
        hasBeenCalled = true;
      },
    });
    const incomingCounter = setupIdCounter(1000);
    const outgoingCounter = setupIdCounter();
    const finishedPromise = setupTest(rpcManager, [
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'authenticate', params: ['valid token']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'getRootObject'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: []}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['registerCallback']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [{type: 'scriptObject', scriptObject: 123},
        'registerCallback',
        'foo',
        {type: 'scriptObject', scriptObject: 1},
      ]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 0}},
      {type: 'in', payload: {id: incomingCounter.request(), method: 'callback', params: [{type: 'scriptObject', scriptObject: 1}]}},
      {type: 'out', payload: {id: incomingCounter.response(), result: true}},
    ]);
    await rpcManager.initialize('valid token');
    await finishedPromise;
    expect(hasBeenCalled).to.be.true;
  });

  it('serializes setter values properly', async () => {
    const rpcManager = new RPCManager({});
    const outgoingCounter = setupIdCounter();
    const finishedPromise = setupTest(rpcManager, [
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'authenticate', params: ['valid token']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'getRootObject'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['emptyValue', 'invalidObject', 'validObject', 'boolean', 'number', 'string']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: []}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'set', params: [{type: 'scriptObject', scriptObject: 123}, 'boolean', true]}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'set', params: [{type: 'scriptObject', scriptObject: 123}, 'number', 42]}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'set', params: [{type: 'scriptObject', scriptObject: 123}, 'string', 'Hello']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'set', params: [{type: 'scriptObject', scriptObject: 123}, 'emptyValue', {type: 'empty'}]}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'set', params: [{type: 'scriptObject', scriptObject: 123}, 'invalidObject', {type: 'scriptObject', scriptObject: 0}]}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'set', params: [{type: 'scriptObject', scriptObject: 123}, 'validObject', {type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 42}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 'Hello'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 'empty'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 0}}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
    ]);
    const rootObject = await rpcManager.initialize('valid token');
    rootObject.boolean = true;
    rootObject.number = 42;
    rootObject.string = 'Hello';
    rootObject.emptyValue = undefined;
    rootObject.invalidObject = null;
    rootObject.validObject = rootObject;
    await finishedPromise;
  });

  it('deserializes getter values properly', async () => {
    const rpcManager = new RPCManager({});
    const outgoingCounter = setupIdCounter();
    const finishedPromise = setupTest(rpcManager, [
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'authenticate', params: ['valid token']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'getRootObject'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['emptyValue', 'invalidObject', 'validObject', 'boolean', 'number', 'string']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: []}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'get', params: [{type: 'scriptObject', scriptObject: 123}, 'boolean']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'get', params: [{type: 'scriptObject', scriptObject: 123}, 'number']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 42}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'get', params: [{type: 'scriptObject', scriptObject: 123}, 'string']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 'Hello'}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'get', params: [{type: 'scriptObject', scriptObject: 123}, 'emptyValue']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'empty'}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'get', params: [{type: 'scriptObject', scriptObject: 123}, 'invalidObject']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 0}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'get', params: [{type: 'scriptObject', scriptObject: 123}, 'validObject']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['emptyValue', 'invalidObject', 'validObject', 'boolean', 'number', 'string']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: []}},
    ]);
    const rootObject = await rpcManager.initialize('valid token');
    await expect(rootObject).to.have.property('boolean').that.eventually.equals(true);
    await expect(rootObject).to.have.property('number').that.eventually.equals(42);
    await expect(rootObject).to.have.property('string').that.eventually.equals('Hello');
    await expect(rootObject).to.have.property('emptyValue').that.eventually.equals(undefined);
    await expect(rootObject).to.have.property('invalidObject').that.eventually.equals(null);
    await expect(rootObject).to.have.property('validObject').that.eventually.has.all.keys(
      'emptyValue',
      'invalidObject',
      'validObject',
      'boolean',
      'number',
      'string',
    );
    await finishedPromise;
  });

  it('serializes function arguments properly', async () => {
    const fn1 = () => {};
    const fn2 = () => {};
    const rpcManager = new RPCManager({});
    const outgoingCounter = setupIdCounter();
    const finishedPromise = setupTest(rpcManager, [
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'authenticate', params: ['valid token']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'getRootObject'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: []}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['foo']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [
        {type: 'scriptObject', scriptObject: 123},
        'foo',
        true,
        42,
        'Hello',
        {type: 'empty'},
        {type: 'scriptObject', scriptObject: 0},
        {type: 'scriptObject', scriptObject: 123},
        {type: 'scriptObject', scriptObject: 1},
        {type: 'scriptObject', scriptObject: 2},
        {type: 'scriptObject', scriptObject: 1},
      ]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
    ]);
    const rootObject = await rpcManager.initialize('valid token');
    await rootObject.foo(true, 42, 'Hello', undefined, null, rootObject, fn1, fn2, fn1);
    await finishedPromise;
  });

  it('deserializes function return value properly', async () => {
    const rpcManager = new RPCManager({});
    const outgoingCounter = setupIdCounter();
    const finishedPromise = setupTest(rpcManager, [
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'authenticate', params: ['valid token']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'getRootObject'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: []}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['getBoolean', 'getNumber', 'getString', 'getEmptyValue', 'getInvalidObject', 'getValidObject']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [{type: 'scriptObject', scriptObject: 123}, 'getBoolean']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [{type: 'scriptObject', scriptObject: 123}, 'getNumber']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 42}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [{type: 'scriptObject', scriptObject: 123}, 'getString']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: 'Hello'}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [{type: 'scriptObject', scriptObject: 123}, 'getEmptyValue']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'empty'}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [{type: 'scriptObject', scriptObject: 123}, 'getInvalidObject']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 0}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [{type: 'scriptObject', scriptObject: 123}, 'getValidObject']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: []}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['getBoolean', 'getNumber', 'getString', 'getEmptyValue', 'getInvalidObject', 'getValidObject']}},
    ]);
    const rootObject = await rpcManager.initialize('valid token');
    await expect(rootObject.getBoolean()).to.eventually.equal(true);
    await expect(rootObject.getNumber()).to.eventually.equal(42);
    await expect(rootObject.getString()).to.eventually.equal('Hello');
    await expect(rootObject.getEmptyValue()).to.eventually.equal(undefined);
    await expect(rootObject.getInvalidObject()).to.eventually.equal(null);
    await expect(rootObject.getValidObject()).to.eventually.have.keys(
      'getBoolean',
      'getNumber',
      'getString',
      'getEmptyValue',
      'getInvalidObject',
      'getValidObject',
    );
    await finishedPromise;
  });

  it('calls non-global callbacks', async () => {
    let hasBeenCalled = false;
    const rpcManager = new RPCManager({});
    const incomingCounter = setupIdCounter(1000);
    const outgoingCounter = setupIdCounter();
    const finishedPromise = setupTest(rpcManager, [
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'authenticate', params: ['valid token']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'getRootObject'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: []}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['foo']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [
        {type: 'scriptObject', scriptObject: 123},
        'foo',
        {type: 'scriptObject', scriptObject: 1},
      ]}},
      {type: 'in', payload: {id: incomingCounter.request(), method: 'callback', params: [{type: 'scriptObject', scriptObject: 1}]}},
      {type: 'out', payload: {id: incomingCounter.response(), result: true}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
    ]);
    const rootObject = await rpcManager.initialize('valid token');
    await rootObject.foo(() => {
      hasBeenCalled = true;
    });
    expect(hasBeenCalled).to.be.true;
    await finishedPromise;
  });

  it('forgets non-global callbacks', async () => {
    let hasBeenCalled = false;
    const rpcManager = new RPCManager({});
    const incomingCounter = setupIdCounter(1000);
    const outgoingCounter = setupIdCounter();
    const finishedPromise = setupTest(rpcManager, [
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'authenticate', params: ['valid token']}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'getRootObject'}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: {type: 'scriptObject', scriptObject: 123}}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listProperties', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: []}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'listMethods', params: [{type: 'scriptObject', scriptObject: 123}]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: ['foo']}},
      {type: 'out', payload: {id: outgoingCounter.request(), method: 'execute', params: [
        {type: 'scriptObject', scriptObject: 123},
        'foo',
        {type: 'scriptObject', scriptObject: 1},
      ]}},
      {type: 'in', payload: {id: outgoingCounter.response(), result: true}},
      {type: 'in', payload: {id: incomingCounter.request(), method: 'callback', params: [{type: 'scriptObject', scriptObject: 1}]}},
      {type: 'out', payload: {id: incomingCounter.response(), error: {
        code: -32603,
        message: 'Internal error. Internal JSON-RPC error.',
        data: 'Function was not found - ID: 1',
      }}},
    ]);
    const rootObject = await rpcManager.initialize('valid token');
    await rootObject.foo(() => {
      hasBeenCalled = true;
    });
    expect(hasBeenCalled).to.be.false;
    await finishedPromise;
  });
});
