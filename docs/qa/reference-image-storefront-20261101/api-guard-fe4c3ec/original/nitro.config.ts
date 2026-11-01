export default {
  "rootDir": "/tmp/bagelito-reference-api-guard-fixture-20261101",
  "serverDir": false,
  "preset": "node-server",
  "serveStatic": false,
  "handlers": [
    {
      "route": "/**",
      "middleware": true,
      "handler": "/workspace/bagelito-pe/src/server/reference-review-guard.server.ts"
    },
    {
      "route": "/**",
      "handler": "/tmp/bagelito-reference-api-guard-fixture-20261101/downstream.ts"
    }
  ],
  "output": {
    "dir": "/tmp/bagelito-reference-api-guard-fixture-20261101/.output"
  }
}
