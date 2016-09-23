# ember-cli-deploy-couchbase

> An ember-cli-deploy plugin to upload index.html to a Couchbase store

This plugin uploads a file, presumably index.html, to a specified Couchbase
store.

## What is an ember-cli-deploy plugin?

A plugin is an addon that can be executed as a part of the ember-cli-deploy pipeline. A plugin will implement one or more of the ember-cli-deploy's pipeline hooks.

For more information on what plugins are and how they work, please refer to the [Plugin Documentation][2].

## Quick Start

To get up and running quickly, do the following:

- Ensure [ember-cli-deploy >= 0.6.0][3] is installed.
- Ensure [ember-cli-deploy-build][4] is installed and configured.

- Install this plugin

```bash
$ ember install ember-cli-deploy-redis
```

- Place the following configuration into `config/deploy.js`

```javascript
ENV.couchbase = {
    host: 'couchbase://development.couchbase.server.local',
    bucketName: '<mybucketname>'
}
```

- Run the pipeline

```bash
$ ember deploy
```

## Installation

```bash
$ ember install ember-cli-deploy-couchbase
```

## How it works?

When you do `ember deploy production`, it will

* Upload the contents of the index.html to the key
`<project-name>:<revision>` as a doc `{ content: "<html>...." }`.
* Then it will update the manifest with details of the freshly
deployed index.html without activating it.

## What is a manifest?

The aforementioned manifest is a doc stored in couchbase keyed by
`<project-name>:index.html:manifest`. It is of the form

```json
{
        current: "<project-name>:<sha>",
        revisions: ["<project-name>:<sha>", "<project-name>:<sha>", "<project-name>:<sha>"]
}
```

Currently you can override the manifest's revisions size, but it
defaults to `10`. What that means is that it keeps track of the last
10 deploys.

## How do I integrate it into my app/api server?

Here's a simple ExpressJS + Couchbase Node.js SDK example. Note it
uses GET parameter `index_key` to reference which `<sha>` version of
index.html to display.

### Express.js (v4.0.0)

```
  var express   = require("express"),
      couchbase = require("couchbase"),
      cbConfig  = { host: 'couchbase://127.0.0.1', bucketName: 'default' },
      cbClient  = new couchbase.Cluster(cbConfig.host),
      cbBucket  = cbClient.openBucket(cbConfig.bucketName, cbConfig.password, function(err) {
        if (err) {
          console.log("Error connecting to bucket!");
        } else {
          console.log("Connected to bucket!");
        }
      });

  var app = express();

  app.get("/", function(req, res) {
    // Send back index.html
    var projectName = "my-express-project";
    var indexKey = req.query.index_key;
    var manifestKey = projectName + ":index.html:manifest";

    cbBucket.get(manifestKey, function(err, manifestDoc) {
      if (err) {
        console.log(manifestKey + " not found!");
        res.status(200).send("BRB");
      } else {
        var indexDocKey = null;

        if (indexKey) {
          indexDocKey = projectName + ":" + indexKey;
        } else {
          indexDocKey = manifestDoc.value.current;
        }

        console.log("Serving version `" + indexDocKey + "`");
        cbBucket.get(indexDocKey, function(err, indexDoc) {
          if (err) {
            console.log(indexDocKey + " not found!");
            res.status(200).send("Check yo self, before you wreck yoself!");
          } else {
            res.status(200).send(indexDoc.value.content);
          }
        });
      }
    });
  });

  app.listen(3000);

```

## Prerequisites

The following properties are expected to be present on the deployment `context` object:

- `distDir`                     (provided by [ember-cli-deploy-build][4])
- `project.name()`              (provided by [ember-cli-deploy][5])
- `revisionData.revisionKey`    (provided by [ember-cli-deploy-revision-data][6])
- `commandLineArgs.revisionKey` (provided by [ember-cli-deploy][5])
- `deployEnvironment`           (provided by [ember-cli-deploy][5])

## Tests

This has been tested with Node.js v4.5.0, Couchbase v3.0.1,
ExpressJS v4.12.3. Note this is still tagged as alpha till we cookup some
unit tests.

[1]: http://ember-cli-deploy.com/docs/v0.6.x/the-lightning-strategy/ "ember-cli-deploy-lightning-pack"
[2]: http://ember-cli.github.io/ember-cli-deploy/plugins "Plugin Documentation"
[3]: http://ember-cli-deploy.com/docs/v0.6.x/ "ember-cli-deploy >= 0.6.0"
[4]: https://github.com/ember-cli-deploy/ember-cli-deploy-build "ember-cli-deploy-build"
[5]: https://github.com/ember-cli/ember-cli-deploy "ember-cli-deploy"
[6]: https://github.com/ember-cli-deploy/ember-cli-deploy-revision-data "ember-cli-deploy-revision-data"
[7]: https://github.com/ember-cli-deploy/ember-cli-deploy-display-revisions "ember-cli-deploy-display-revisions"
