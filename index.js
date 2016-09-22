/* jshint node: true */
'use strict';

let DeployPluginBase = require("ember-cli-deploy-plugin"),
    RSVP = require('rsvp'),
    CouchbaseAdapter = require('./lib/couchbase.js');

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
                currentKey: "current"
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
