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
                    return (context.commandOptions.revision || (context.revisionData && context.revisionData.revisionKey));
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

                return Promise.resolve(client.fetchRevisions(manifestKey))
                    .then(function(manifestDoc) {
                        let revisions  = manifestDoc[revisionsKey],
                            currentRev = manifestDoc[currentKey],
                            revisions2 = revisions.map(function(revision, i) {
                                return {
                                    revision: revision,
                                    active: revision === currentRev
                                };
                            });
                        return { revisions: revisions2 };
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

            activate: function(context) {
                var self = this,
                    manifestKey = this.readConfig("manifestKey"),
                    revisionsKey = this.readConfig("revisionsKey"),
                    currentKey = this.readConfig("currentKey"),
                    revision = this.readConfig("revision"),
                    client = this.readConfig("couchbaseConnection");

                return Promise.resolve(client.activate(manifestKey, revisionsKey, currentKey, revision))
                    .then(this._activateSuccessMessage.bind(this, revision))
                    .then(function() {
                        return {
                            revisionData: {
                                activatedRevisionKey: revision
                            }
                        };
                    })
                    .catch(this._activateErrorMessage.bind(this));
            },

            _activateErrorMessage: function(revision) {
                this._printErrorMessage("Activation failed for revision `" + revision + "`!");
                this._printErrorMessage("Please check your couchbase settings");
            },

            _activateSuccessMessage: function(revision) {
                this._printSuccessMessage("✔ Activated revision `" + revision + "`");
            },

            _deployErrorMessage: function(revisionKey) {
                this._printErrorMessage('Failed to upload `' + revisionKey + '`!\n');
                this._printErrorMessage('Did you try to upload an already uploaded revision?\n\n');

                this.log('Please run `ember deploy:list` to investigate.');
            },

            _deploySuccessMessage: function(revisionKey) {
                this._printSuccessMessage('Upload of `' + revisionKey +'` successful!\n\n');
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
