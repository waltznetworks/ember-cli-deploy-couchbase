var CoreObject  = require('core-object'),
    RSVP        = require('rsvp'),
    couchbase   = require('couchbase'),
    chalk       = require('chalk'),
    Promise     = require('ember-cli/lib/ext/promise'),
    SilentError = require('silent-error');
    fs          = require('fs'),
    readFile    = RSVP.denodeify(fs.readFile);

module.exports = CoreObject.extend({
    init: function(options) {
        var self = this,
            host = options.host,
            bucketName = options.bucketName;

        if (!host) {
            throw new SilentError("You have to pass in a host");
        }

        if (!bucketName) {
            throw new SilentError("You have to pass in a bucketName");
        }

        self.client = self._setupCouchbaseConnection(options, function(err) {
            if (err) {
                throw new SilentError("Error setting up couchbase connection: ", err);
            }
        });
    },

    fetchRevisions: function(manifestKey) {
        return this._findManifest(manifestKey);
    },

    upload: function(indexHTMLPath, manifestKey, revisionsKey, currentKey, revision) {
        return this._readFileContents(indexHTMLPath)
            .then(this._uploadIfNotAlreadyInManifest.bind(this, manifestKey, revisionsKey, currentKey, revision));
    },

    activate: function(manifestKey, revisionsKey, currentKey, revision) {
        return this._findManifest(manifestKey)
            .then(this._setCurrentRevision.bind(this, currentKey, revision))
            .then(this._uploadManifest.bind(this, manifestKey))
    },

    /**
     * Setup a connection to couchbase cluster.
     *
     * @method _setupCouchbaseConnection
     */
    _setupCouchbaseConnection: function(config, next) {
        return new couchbase.Cluster(config.host).openBucket(config.bucketName, next);
    },

    /**
     * Given a path to a file, reads its contents into a string.
     *
     * @method _readFileContents
     * @return {RSVP.Promise} a promise which fullfills with the contents of
     *                        the file, hopefullly.
     */
    _readFileContents: function(path) {
        return readFile(path)
            .then(function(buffer) {
                return buffer.toString();
            });
    },

    _ensureManifestExists: function(manifestKey, revisionsKey, currentKey) {
        var self = this;
        return Promise.resolve(self._findManifest(manifestKey))
            .catch(function() {
                // If a manifest doesn't exist, just create one.
                return self._blankManifest(revisionsKey, currentKey);
            });
    },

    _uploadIfNotAlreadyInManifest: function(manifestKey, revisionsKey, currentKey, revision, indexHTML) {
        var self = this;
        return self._ensureManifestExists(manifestKey, revisionsKey, currentKey)
            .then(function(manifestDoc) {
                if (!self._revisionExists(manifestDoc, revisionsKey, revision)) {
                    return self._uploadRevision(revision, indexHTML, manifestDoc, manifestKey, revisionsKey, currentKey)
                        .finally(function() {
                            self._addToManifest(manifestDoc, revisionsKey, revision);
                            self._cleanUpManifest(manifestDoc, revisionsKey, 10);
                            return self._uploadManifest(manifestKey, manifestDoc);
                        });
                }
            });
    },

    /**
     * Check if a revision was previously uploaded.
     *
     * @method _revisionExists
     * @return {Boolean}
     */
    _revisionExists: function(manifestDoc, revisionsKey, revision) {
        // FIXME: This should check the actual uploaded
        // revision document as well.
        return manifestDoc[revisionsKey].indexOf(revision) > -1;
    },

    _blankManifest: function(revisionsKey, currentKey) {
        let manifest = {};
        manifest[revisionsKey] = [];
        manifest[currentKey] = "";
        return manifest;
    },

    _addToManifest: function(manifestDoc, revisionsKey, revision) {
        manifestDoc[revisionsKey].unshift(revision);
    },

    _cleanUpManifest: function(manifestDoc, revisionsKey, manifestSize) {
        manifestDoc[revisionsKey].splice(manifestSize);
    },

    _setCurrentRevision: function(currentKey, revision, manifestDoc) {
        manifestDoc[currentKey] = revision;
        return manifestDoc;
    },

    /**
     * Upload the deployment manifest document.
     *
     * @method _uploadManifest
     * @param manifestKey {String} the couchbase key under which the manifest
     *                             is stored.
     * @param manifestDoc {Object} an object representing a deployment manifest.
     * @return {RSVP.Promise}      a promise to upload the manifest.
     */
    _uploadManifest: function(manifestKey, manifestDoc) {
        var self = this;
        return new RSVP.Promise(function(resolve, reject) {
            self.client.upsert(manifestKey, manifestDoc, function(err, res) {
                if (err) {
                    reject("There was a problem uploading the manifest document.")
                } else {
                    resolve();
                }
            });
        });
    },

    /**
     * Finds the deployment manifest document.
     *
     * @method _findManifest
     * @param manifestKey {String} the couchbase key under which the manifest
     *                             is stored.
     * @return {RSVP.Promise}      a promise to find the manifest.
     */
    _findManifest: function(manifestKey) {
        var self = this;
        return new RSVP.Promise(function(resolve, reject) {
            self.client.get(manifestKey, function(err, res) {
                if (err) {
                    reject("Manifest not found!");
                } else {
                    resolve(res.value);
                }
            });
        });
    },

    /**
     * Upload a revision, while updating the manifest etc.
     *
     * @method _uploadRevision
     * @param revision {String} the tag for the revision being uploaded.
     * @param indexHTML {String} contents of index.html.
     * @param manifestDoc {Object} the manifest document.
     * @param manifestKey {String} the key for the manifest in couchbase.
     * @param revisionsKey {String} the sub-key in the manifest document specifying the revisions.
     * @param currentKey {String} the sub-key in the manifest document specifying the currently activated verison.
     * @return {RSVP.Promise} if the upload was successful.
     */
    _uploadRevision: function(revision, indexHTML, manifestDoc,
                       manifestKey, revisionsKey, currentKey) {
        var self = this;
        return new RSVP.Promise(function(resolve, reject) {
            self.client.insert(revision, { content: indexHTML.toString() }, function(err, res) {
                if (err) {
                    reject(err.message);
                } else {
                    resolve();
                }
            });
        });
    }
});
