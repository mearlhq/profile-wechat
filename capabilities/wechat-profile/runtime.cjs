let bridge;
let responses;

function getLocation({ type = 'wgs84', success, fail, complete } = {}) {
  function finish(callback, result) {
    try {
      callback?.(result);
    } finally {
      complete?.(result);
    }
  }
  if (type !== 'wgs84' || !navigator.geolocation) {
    queueMicrotask(() => finish(fail, { errMsg: 'getLocation:fail unavailable' }));
    return;
  }
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    finish(success, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      speed: coords.speed,
      accuracy: coords.accuracy,
      altitude: coords.altitude,
      verticalAccuracy: coords.altitudeAccuracy,
      horizontalAccuracy: coords.accuracy,
      errMsg: 'getLocation:ok',
    });
  }, error => {
    finish(fail, { errMsg: `getLocation:fail ${error.message}` });
  });
}

function installBridge(actions) {
  if (!window.wx && !window.WeixinJSBridge) {
    window.wx = {
      ready(callback) {
        if (typeof callback === 'function') queueMicrotask(callback);
      },
      getLocation,
    };
  }
  responses = actions.responses ?? {};
  if (window.WeixinJSBridge) return;

  bridge ??= {
    invoke(method, params, callback) {
      if (typeof callback !== 'function') return;
      if (method === 'geoLocation') {
        getLocation({
          type: params?.type,
          complete: ({ errMsg, ...result }) => callback({
            ...result,
            err_msg: errMsg.replace(/^getLocation:/, 'geoLocation:'),
          }),
        });
        return;
      }
      const result = Object.hasOwn(responses, method)
        ? structuredClone(responses[method])
        : { err_msg: `${method}:fail unsupported` };
      queueMicrotask(() => callback(result));
    },
    call(method, callback) {
      bridge.invoke(method, {}, callback);
    },
  };
  Object.defineProperty(window, 'WeixinJSBridge', {
    configurable: true,
    writable: true,
    value: bridge,
  });
  queueMicrotask(() => document.dispatchEvent(new Event('WeixinJSBridgeReady')));
}

module.exports.installBridge = installBridge;
module.exports.install = config => {
  Object.defineProperty(window, '__mearlAppProfile__', {
    configurable: true,
    value: config.profile,
  });

  const identity = {
    userAgent: config.userAgent,
    appVersion: config.userAgent.replace(/^Mozilla\//, ''),
    platform: config.navigatorPlatform,
    maxTouchPoints: config.maxTouchPoints,
  };
  for (const [name, value] of Object.entries(identity)) {
    Object.defineProperty(navigator, name, { configurable: true, get: () => value });
  }

  installBridge(config.actions);
};
