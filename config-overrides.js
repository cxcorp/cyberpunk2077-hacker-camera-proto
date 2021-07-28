module.exports = {
  devServer: (configFunction) => {
    return (proxy, allowedHost) => {
      const config = configFunction(proxy, allowedHost);
      const ex = config.headers || {};
      ex["Cross-Origin-Embedder-Policy"] = "require-corp";
      ex["Cross-Origin-Opener-Policy"] = "same-origin";
      config.headers = ex;
      return config;
    };
  },
};
