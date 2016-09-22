/* jshint node: true */
'use strict';

let DeployPluginBase = require("ember-cli-deploy-plugin"),
    RSVP = require('rsvp'),
    CouchbaseAdapter = require('./lib/couchbase.js'),
    path = require('path');


// Lets make all our collective lives easier by not swalling errors
RSVP.on('error', function(reason) {
    console.log("Caught a silent error!");
    console.assert(false, reason);
});


module.exports = {
    name: 'ember-cli-deploy-couchbase',
    type: 'ember-cli-deploy-addon',

    createDeployPlugin: function(options) {
        let DeployPlugin = DeployPluginBase.extend({
            name: options.name,

            defaultConfig: {
                host: "127.0.0.1",
                port: "8091",
                couchbaseConnection: function(context) {
                    var host = this.readConfig("host");
                    var bucketName = this.readConfig("bucketName");
                    return new CouchbaseAdapter({ host: host,
                                                  bucketName: bucketName });
                },

                manifestKey: function(context) {
                    var projectName = context.project.name();
                    return projectName + ":index.html:manifest";
                },
                revisionsKey: "revisions",
                currentKey: "current",
                revision: function(context) {
                    var projectName = context.project.name();
                    return projectName + ":" + (context.commandOptions.revision || (context.revisionData && context.revisionData.revisionKey));
                },

                filePattern: "index.html"
            },

            requiredConfig: ['host', 'bucketName'],

            fetchRevisions: function(context) {
                var self = this,
                    manifestKey = this.readConfig("manifestKey"),
                    revisionsKey = this.readConfig("revisionsKey"),
                    currentKey = this.readConfig("currentKey"),
                    client = this.readConfig("couchbaseConnection");

                return Promise.resolve(client.fetchRevisions(manifestKey, revisionsKey, currentKey))
                    .then(function(revisions, current) {
                        var transformedRevisions = revisions.map(function(revision, i) {
                            return {
                                revision: revision,
                                active: revision === current
                            };
                        });
                        return { revisions: transformedRevisions };
                    })
                    .catch(function() {
                        return { revisions: null };
                    });
            },

            upload: function(context) {
                var self = this,
                    manifestKey = this.readConfig("manifestKey"),
                    revisionsKey = this.readConfig("revisionsKey"),
                    currentKey = this.readConfig("currentKey"),
                    revision = this.readConfig("revision"),
                    client = this.readConfig("couchbaseConnection"),
                    filePattern = this.readConfig("filePattern"),
                    distDir = context.distDir,
                    indexHTMLPath = path.join(distDir, filePattern);

                return Promise.resolve(client.upload(indexHTMLPath, manifestKey, revisionsKey, currentKey, revision))
                    .then(this._deploySuccessMessage.bind(this, revision))
                    .catch(this._deployErrorMessage.bind(this, revision));
            },

            _deployErrorMessage: function(revisionKey) {
                this._printErrorMessage('\nFailed to upload `' + revisionKey + '`!\n');
                this._printErrorMessage('Did you try to upload an already uploaded revision?\n\n');

                this.log('Please run `ember deploy:list` to investigate.');
            },

            _deploySuccessMessage: function(revisionKey) {
                this._printSuccessMessage('\nUpload of `' + revisionKey +'` successful!\n\n');
            },

            _printErrorMessage: function(message) {
                return this.log(message, { color: "red" });
            },

            _printSuccessMessage: function(message) {
                return this.log(message, { color: "green" });
            }
        });
        return new DeployPlugin();
    },
};
