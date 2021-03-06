module.exports = (function() {
  'use strict';

  var fs = require('fs'),
  util = require('util'),
  minimatch = require('minimatch'),
  EventEmitter = require('events').EventEmitter,
  sweepDuration = 100, // 100ms default sweepDuration
  sweepIncrement = 10,
  sweepMaximum = 2500;

  function Watcher(dir, options, callback) {
    callback = (!callback && typeof options === 'function') ? options : callback;
    options = options || {};

    if (typeof dir !=='string') {
      throw new TypeError('Directory must be a pathname');
    }

    this.path = dir + (/\/$/.test(dir) ? '' : '/');
    this.duration = sweepDuration;
    this.collector = {};
    this.subdir = {};
    this.sweep = this.sweep.bind(this);
    this.action = callback;
    this.options = options;
    this.ignore = util.isArray(options.ignore) ? options.ignore : [options.ignore];
    this.emitter = new EventEmitter();

    var that = this;

    fs.watch(dir, this.changed.bind(this)).on('error', function(err) {
      console.error(dir);
      console.error(err.toString());
    });
    fs.readdir(dir, function(err, files) {
      files.forEach(function(filename) {
        if (that.isIgnore(that.path+filename)) { return; }
        that.sub(filename);
      });
    });
  }

  (function(proto, ext) {
    var k;
    for (k in ext) { proto[k] = ext[k]; }
  }(Watcher.prototype, {
    changed : function(event, filename) {
      this.mark(filename);
    },
    sub : function(filename) {
      if (!filename) { return; }
      fs.stat(this.path + filename, function(err, stats) {
        if (err && this.subdir[filename]) {
          this.subdir[filename].destroy();
          delete this.subdir[filename];
        }
        if (stats && stats.isDirectory() && !this.subdir[filename]) {
          this.subdir[filename] = new Watcher(this.path + filename, this.options, this.mark.bind(this, filename));
        }
      }.bind(this));
    },
    mark : function(filename) {
      if (this.active) { clearTimeout(this.active); }
      if (filename) {
        if (this.isIgnore(this.path+filename)) { return; }
        this.collector[filename] = this.collector[filename] || 0;
        this.duration += this.collector[filename]++ ? 0 : sweepIncrement;
        this.duration = Math.min(this.duration, sweepMaximum);
      }
      this.active = setTimeout(this.sweep, this.duration);
      if (!this.subdir[filename]) {
        this.sub(filename);
      }
    },
    sweep : function() {
      if (this.action) {
        this.action(this.collector);
      }
      this.emitter.emit('changed', this.collector);
      var k;
      for (k in this.collector) {
        delete this.collector[k];
      }
      this.duration = sweepDuration;
      this.active = false;
    },
    isIgnore : function(path) {
      var opt = {matchBase: true};
      return this.ignore.some(function(rule) {
        return rule ? minimatch(path, rule, opt) : false;
      });
    },
    destroy : function() {
      var k;
      for (k in this.subdir) {
        this.subdir[k].destroy();
        delete this.subdir[k];
      }
    }
  }));

  return Watcher;
}());
