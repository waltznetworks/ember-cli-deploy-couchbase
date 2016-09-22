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
                return err.message;
            }
        });
    },

    fetchRevisions: function(manifestKey, revisionsKey, currentKey) {
        var self = this;
        return new RSVP.Promise(function(resolve, reject) {
            self.client.get(manifestKey, function(err, res) {
                if (err) {
                    if (err.code === 13) {
                        // If the manifest was not found, we continue with as
                        // an empty manifest.
                        // TODO: Maybe we should throw a silent warning log
                        // here, in case of typos.
                        resolve([]);
                    } else {
	                reject(err.message);
                    }
	        } else {
	            var manifestDoc = res.value,
	                revisions   = manifestDoc[revisionsKey],
	                current     = manifestDoc[currentKey];

                    resolve(revisions, current);
                }
            });
        });
    },

    upload: function(indexHTMLPath, manifestKey, revisionsKey, currentKey, revision) {
        return this._readFileContents(indexHTMLPath)
            .then(this._uploadIfNotAlreadyInManifest.bind(this, manifestKey, revisionsKey, currentKey, revision));
    },

    activate: function(revisionKey) {
        var self = this;

        if (!revisionKey) {
            return self._printErrorMessage(self._noRevisionPassedMessage());
        }

        var uploadKey = this._currentKey();
        return new RSVP.Promise(function(resolve, reject) {
            self.client.get(self._manifestKey(), function(err, res) {
                if (err) {
                    self._printErrorMessage(self._manifestNotFoundMessage(self._manifestKey()));
                    return reject();
                } else {
                    var manifestDoc = res.value;
                    manifestDoc[self._currentKey()] = revisionKey;
                    self.client.upsert(self._manifestKey(), manifestDoc, function(err, res) {
                        if (err) {
                            self._printErrorMessage(self._activationFailureMessage());
                            return reject();
                        } else {
                            self._printSuccessMessage(self._activationSuccessfulMessage());
                            return resolve();
                        }
                    });
                }
            });
        });
    },

    // Private methods
    _setupCouchbaseConnection: function(config, next) {
        return new couchbase.Cluster(config.host).openBucket(config.bucketName, next);
    },

    _readFileContents: function(path) {
        return readFile(path)
            .then(function(buffer) {
                return buffer.toString();
            });
    },

    _ensureManifestExists: function(manifestKey, revisionsKey, currentKey) {
        var self = this;
        return new RSVP.Promise(function(resolve, reject) {
            self.client.get(manifestKey, function(err, res) {
                if (res) {
                    resolve(res.value);
                } else {
                    // If a manifest doesn't exist, just create one.
                    resolve(self._blankManifest(revisionsKey, currentKey));
                }
            })
        });
    },

    _uploadIfNotAlreadyInManifest: function(manifestKey, revisionsKey, currentKey, revision, indexHTML) {
        var self = this;
        return self._ensureManifestExists(manifestKey, revisionsKey, currentKey)
            .then(function(manifestDoc) {
                if (!self._revisionExists(manifestDoc, revisionsKey, revision)) {
                    console.log("\nUploading..");
                    return self._uploadRevision(revision, indexHTML, manifestDoc, manifestKey, revisionsKey, currentKey);
                } else {
                    console.log("\nRevision found already");
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

                self._addToManifest(manifestDoc, revisionsKey, revision);
                self._cleanUpManifest(manifestDoc, revisionsKey, 10);
                self._uploadManifest(manifestKey, manifestDoc);
            });
        });
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

    _uploadManifest: function(manifestKey, manifestDoc) {
        var self = this;
        return new RSVP.Promise(function(resolve, reject) {
            self.client.upsert(manifestKey, manifestDoc, function(err, res) {
                if (err) {
                    reject("There was a problem creating the manifest document.")
                } else {
                    resolve();
                }
            });
        });
    },

    _noRevisionPassedMessage: function() {
        var err = '\nError! Please pass a revision to `deploy:activate`.\n\n';

        return err + white(this._revisionSuggestion());
    },

    _activationSuccessfulMessage: function() {
        var success = green('\nActivation successful!\n\n');
        var message = white('Please run `'+green('ember deploy:list')+'` to see '+
                            'what revision is current.');

        return success + message;
    },

    _activationFailureMessage: function() {
        var failure = red("\nActivation unsuccessful!\n\n");
        var message = white("Please check your couchbase settings");
        return failure + message;
    },

    _revisionSuggestion: function() {
        var suggestion = 'Try to run `'+green('ember deploy:list')+'` '+
            'and pass a revision listed there to `' +
            green('ember deploy:activate')+'`.\n\nExample: \n\n'+
            'ember deploy:activate --revision <manifest>:<sha>';

        return suggestion;
    }
});
