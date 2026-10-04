
{
  "version": 2,
  "builds": [
    {
      "src": "server.mjs",
      "use": "@vercel/node"
    },
    {
      "src": "*.html",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server.mjs"
    },
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ]
}
