(function(){
  if (typeof this.$ === 'undefined') {
    throw new Error('jquery.js/zepto.js required to run Thorax');
  } else {
    if (!$.fn.forEach) {
      // support jquery/zepto iterators
      $.fn.forEach = $.fn.each;
     }
  }

  if (typeof this._ === 'undefined') {
    throw new Error('Underscore.js required to run Thorax');
  }

  if (typeof this.Backbone === 'undefined') {
    throw new Error('Backbone.js required to run Thorax');
  }

  //private vars for Thorax.View
  var handlebarsExtension = 'handlebars',
      handlebarsExtensionRegExp = new RegExp('\\.' + handlebarsExtension + '$'),
      layout_cid_attribute_name = 'data-layout-cid',
      view_name_attribute_name = 'data-view-name',
      view_cid_attribute_name = 'data-view-cid',
      call_method_attribute_name = 'data-call-method',
      view_placeholder_attribute_name = 'data-view-tmp',
      model_cid_attribute_name = 'data-model-cid',
      model_name_attribute_name = 'data-model-name',
      collection_cid_attribute_name = 'data-collection-cid',
      collection_name_attribute_name = 'data-collection-name',
      old_backbone_view = Backbone.View,
      //android scrollTo(0, 0) shows url bar, scrollTo(0, 1) hides it
      minimumScrollYOffset = (navigator.userAgent.toLowerCase().indexOf("android") > -1) ? 1 : 0,
      ELEMENT_NODE_TYPE = 1;

  //wrap Backbone.View constructor to support initialize event
  var _viewsIndexedByCid = {};
  Backbone.View = function(options) {
    this.cid = _.uniqueId('view');
    _viewsIndexedByCid[this.cid] = this;
    this._boundCollectionsByCid = {};
    this._renderCount = 0;
    this._configure(options || {});
    this._ensureElement();
    this.delegateEvents();
    this.trigger('initialize:before', options);
    this.initialize.apply(this, arguments);
    this.trigger('initialize:after', options);
  };

  Backbone.View.prototype = old_backbone_view.prototype;
  Backbone.View.extend = old_backbone_view.extend;

  var View = Backbone.View.extend({
    _configure: function(options) {
      //this.options is removed in Thorax.View, we merge passed
      //properties directly with the view and template context
      _.extend(this, options || {});

      //compile a string template if it is set as this.template
      if (typeof this.template === 'string') {
        this._template = Handlebars.compile(this.template);
        this.template = renderTemplate;
      }
      
      //will be called again by Backbone.View(), after _configure() is complete but safe to call twice
      this._ensureElement();

      //model and collection events
      bindModelAndCollectionEvents.call(this, this.constructor.events);
      if (this.events) {
        bindModelAndCollectionEvents.call(this, this.events);
      }

      //mixins
      for (var i = 0; i < this.constructor.mixins.length; ++i) {
        applyMixin.call(this, this.constructor.mixins[i]);
      }
      if (this.mixins) {
        for (var i = 0; i < this.mixins.length; ++i) {
          applyMixin.call(this, this.mixins[i]);
        }
      }

      //views
      this._views = {};
      if (this.views) {
        for (var local_name in this.views) {
          if (_.isArray(this.views[local_name])) {
            this[local_name] = this.view.apply(this, this.views[local_name]);
          } else {
            this[local_name] = this.view(this.views[local_name]);
          }
        }
      }
    },

    _ensureElement : function() {
      Backbone.View.prototype._ensureElement.call(this);
      (this.el[0] || this.el).setAttribute(view_name_attribute_name, this.name || this.cid);
      (this.el[0] || this.el).setAttribute(view_cid_attribute_name, this.cid);      
    },

    mixin: function(name) {
      if (!this._appliedMixins) {
        this._appliedMixins = [];
      }
      if (this._appliedMixins.indexOf(name) == -1) {
        this._appliedMixins.push(name);
        if (typeof name === 'function') {
          name.call(this);
        } else {
          var mixin = Thorax.registry.Mixins[name];
          _.extend(this, mixin[1]);
          //mixin callback may be an array of [callback, arguments]
          if (_.isArray(mixin[0])) {
            mixin[0][0].apply(this, mixin[0][1]);
          } else {
            mixin[0].apply(this, _.toArray(arguments).slice(1));
          }
        }
      }
    },
  
    view: function(name, options) {
      var instance;
      if (typeof name === 'object' && name.hash && name.hash.name) {
        // named parameters
        options = name.hash;
        name = name.hash.name;
        delete options.name;
      }

      if (typeof name === 'string') {
        if (!Thorax.registry.Views[name]) {
          throw new Error('view: ' + name + ' does not exist.');
        }
        instance = new Thorax.registry.Views[name](options);
      } else {
        instance = name;
      }
      this._views[instance.cid] = instance;
      return instance;
    },
    
    template: renderTemplate,

    loadTemplate: function(file, data, scope) {
      var fileName = Thorax.templatePathPrefix + file + (file.match(handlebarsExtensionRegExp) ? '' : '.' + handlebarsExtension);
      return scope.templates[fileName];
    },
  
    html: function(html) {
      if (typeof html === 'undefined') {
        return this.el.innerHTML;
      } else {
        var element;
        if (this._renderCount) {
          //preserveCollectionElements calls the callback after it has a reference
          //to the collection element, calls the callback, then re-appends the element
          preserveCollectionElements.call(this, function() {
            element = this.$el.html(html);
          });
        } else {
          element = this.$el.html(html);
        }
        appendViews.call(this);
        return element;
      }
    },
  
    //allow events hash to specify view, collection and model events
    //as well as DOM events. Merges Thorax.View.events with this.events
    delegateEvents: function(events) {
      this.undelegateEvents && this.undelegateEvents();
      //bindModelAndCollectionEvents on this.constructor.events and this.events
      //done in _configure
      this.registerEvents(this.constructor.events);
      if (this.events) {
        this.registerEvents(this.events);
      }
      if (events) {
        this.registerEvents(events);
        bindModelAndCollectionEvents.call(this, events);
      }
    },

    registerEvents: function(events) {
      processEvents.call(this, events).forEach(this._addEvent, this);
    },

    //params may contain:
    //- name
    //- originalName
    //- selector
    //- type "view" || "DOM"
    //- handler
    _addEvent: function(params) {
      if (params.type === 'view') {
        this.bind(params.name, params.handler, this);
      } else {
        var boundHandler = containHandlerToCurentView(bindEventHandler.call(this, params.handler), this.cid);
        if (params.selector) {
          //TODO: determine why collection views and some nested views
          //need defered event delegation 
          if (typeof jQuery !== 'undefined' && $ === jQuery) {
            _.defer(_.bind(function() {
              this.$el.delegate(params.selector, params.name, boundHandler);
            }, this));
          } else {
            this.$el.delegate(params.selector, params.name, boundHandler);
          }
        } else {
          this.$el.bind(params.name, boundHandler);
        }
      }
    },

    _shouldFetch: function(model_or_collection, options) {
      var url = (
        (!model_or_collection.collection && getValue(model_or_collection, 'urlRoot')) ||
        (model_or_collection.collection && getValue(model_or_collection.collection, 'url')) ||
        (!model_or_collection.collection && model_or_collection._byCid && model_or_collection._byId && getValue(model_or_collection, 'url'))
      );
      return url && options.fetch && (
        typeof model_or_collection.isPopulated === 'undefined' || !model_or_collection.isPopulated()
      );
    },
  
    setModel: function(model, options) {
      var el = (this.el[0] || this.el);
      el.setAttribute(model_cid_attribute_name, model.cid);
      if (model.name) {
        el.setAttribute(model_name_attribute_name, model.name);
      }

      var old_model = this.model;

      if (old_model) {
        this.freeze(old_model);
      }
  
      if (model) {
        this.model = model;
        this.setModelOptions(options);

        this._events.model.forEach(function(event) {
          this.model.bind(event[0], event[1]);
        }, this);

        this.model.trigger('set', this.model, old_model);
    
        if (this._shouldFetch(this.model, this._modelOptions)) {
          var success = this._modelOptions.success;
          this._loadModel(this.model, this._modelOptions);
        } else {
          //want to trigger built in event handler (render() + populate())
          //without triggering event on model
          onModelChange.call(this);
        }
      }
  
      return this;
    },

    _loadModel: function(model, options) {
      model.fetch(options);
    },

    setModelOptions: function(options) {
      if (!this._modelOptions) {
        this._modelOptions = {
          fetch: true,
          success: false,
          render: true,
          populate: true,
          errors: true
        };
      }
      _.extend(this._modelOptions, options || {});
      return this._modelOptions;
    },

    //DEPRECATION: backwards compatibility with < 1.3
    setCollection: function(collection, options) {
      this.collection = collection;
      this.bindCollection(collection, options);
    },
    //end deprecation

    bindCollection: function(collection, options) {
      var old_collection = this.collection;

      if (old_collection) {
        this.freeze(old_collection);
      }
  
      if (collection) {
        collection.cid = collection.cid || _.uniqueId('collection');
        options = this.setCollectionOptions(collection, options);

        this._boundCollectionsByCid[collection.cid] = collection;
        this._events.collection.forEach(function(event) {
          collection.bind(event[0], event[1]);
        });
      
        collection.trigger('set', collection, old_collection);

        if (this._shouldFetch(collection, options)) {
          this._loadCollection(collection, options);
        } else {
          //want to trigger built in event handler (render())
          //without triggering event on collection
          onCollectionReset.call(this, collection);
        }
      }
  
      return this;
    },

    _loadCollection: function(collection, options) {
      collection.fetch(options);
    },

    setCollectionOptions: function(collection, options) {
      if (!this._collectionOptionsByCid) {
        this._collectionOptionsByCid = {};
      }
      this._collectionOptionsByCid[collection.cid] = {
        fetch: true,
        success: false,
        errors: true
      };
      _.extend(this._collectionOptionsByCid[collection.cid], options || {});
      return this._collectionOptionsByCid[collection.cid];
    },

    context: function(model) {
      return model ? model.attributes : {};
    },

    render: function(output) {
      if (typeof output === 'undefined' || (!_.isElement(output) && !is$(output) && !(output && output.el) && typeof output !== 'string')) {
        output = this.template(this._template || getViewName.call(this), getContext.call(this, this.model));
      } else if (typeof output === 'function') {
        output = this.template(output, getContext.call(this, this.model));
      }
      //accept a view, string, Handlebars.SafeString or DOM element
      this.html((output && output.el) || (output && output.string) || output);
      ++this._renderCount;
      this.trigger('rendered');
      return output;
    },

    renderCollection: function(collection) {
      //DEPRECATION: backwards compatibility with < 1.3
      if (!collection) {
        collection = this.collection;
      }
      //end DEPRECATION
      this.render();
      var collection_element = getCollectionElement.call(this, collection).empty();
      if (collection.isEmpty()) {
        appendEmpty.call(this, collection);
      } else {
        collection.forEach(function(item, i) {
          this.appendItem(collection, item, i, {
            collectionElement: collection_element
          });
        }, this);
      }
      this.trigger('rendered:collection', collection_element, collection);
    },

    //DEPRECATION: backwards compatibility with < 1.3, will become private
    renderItem: function(item, i, collection) {
      if (!collection) {
        collection = this.collection;
      }
      var collection_options = this._collectionOptionsByCid[collection.cid];
      if (collection_options['item-view']) {
        var view = this.view(collection_options['item-view'], {
          model: item
        });
        view.render(collection_options['item-template']);
        return view;
      } else {
        var context = this.itemContext(item, i);
        return this.template(collection_options['item-template'] || getViewName.call(this) + '-item', context);
      }
    },
  
    //DEPRECATION: backwards compatibility with < 1.3, will become private
    renderEmpty: function(collection) {
      if (!collection) {
        collection = this.collection;
      }
      var collection_options = this._collectionOptionsByCid[collection.cid],
          context = this.emptyContext();
      if (collection_options['empty-view']) {
        var view = this.view(collection_options['empty-view'], context);
        view.render(collection_options['empty-template']);
        return view;
      } else {
        var emptyTemplate = collection_options['empty-template'];
        if (!emptyTemplate) {
          var name = getViewName.call(this, true);
          if (name) {
            emptyTemplate = this.loadTemplate(name + '-empty', {}, Thorax.registry);
          }
          if (!emptyTemplate) {
            return;
          }
        }
      }
      return this.template(emptyTemplate, context);
    },

    //DEPRECATION: backwards compatibility with < 1.3, will become private
    itemContext: function(item, i) {
      return item.attributes;
    },

    //DEPRECATION: backwards compatibility with < 1.3, will become private
    emptyContext: function() {},

    //appendItem(collection, model [,index])
    //appendItem(collection, html_string, index)
    //appendItem(collection, view, index)
    appendItem: function(collection, model, index, options) {
      //DEPRECATION: backwards compatibility with < 1.3
      if (typeof collection.length === 'undefined' && !collection.models) {
        collection = this.collection;
        model = arguments[0];
        index = arguments[1];
        options = arguments[2];
      }

      //empty item
      if (!model) {
        return;
      }

      var item_view,
          collection_element = (options && options.collectionElement) || getCollectionElement.call(this, collection);

      options = options || {};

      //if index argument is a view
      if (index && index.el) {
        index = collection_element.children().indexOf(index.el) + 1;
      }

      //if argument is a view, or html string
      if (model.el || typeof model === 'string') {
        item_view = model;
      } else {
        index = index || collection.indexOf(model) || 0;
        item_view = this.renderItem(model, index, collection);
      }

      if (item_view) {

        if (item_view.cid) {
          this._views[item_view.cid] = item_view;
        }

        var item_element = item_view.el ? [item_view.el] : _.filter($(item_view), function(node) {
          //filter out top level whitespace nodes
          return node.nodeType === ELEMENT_NODE_TYPE;
        });

        $(item_element).attr(model_cid_attribute_name, model.cid);
        var previous_model = index > 0 ? collection.at(index - 1) : false;
        if (!previous_model) {
          collection_element.prepend(item_element);
        } else {
          //use last() as appendItem can accept multiple nodes from a template
          collection_element.find('[' + model_cid_attribute_name + '="' + previous_model.cid + '"]').last().after(item_element);
        }

        appendViews.call(this, item_element);

        if (!options.silent) {
          this.trigger('rendered:item', item_element);
        }
      }
      return item_view;
    },
  
    freeze: function(modelOrCollection) {
      if (this.model && (modelOrCollection === this.model || !modelOrCollection)) {
        this._events.model.forEach(function(event) {
          this.model.unbind(event[0], event[1]);
        }, this);
      }
      for (var cid in this._boundCollectionsByCid) {
        if (!modelOrCollection || this._boundCollectionsByCid[cid] === modelOrCollection) {
          this._events.collection.forEach(function(event) {
            this._boundCollectionsByCid[cid].unbind(event[0], event[1]);
          }, this);
        }
      }
    },
  
    //serializes a form present in the view, returning the serialized data
    //as an object
    //pass {set:false} to not update this.model if present
    //can pass options, callback or event in any order
    serialize: function() {
      var callback, options, event;
      //ignore undefined arguments in case event was null
      for (var i = 0; i < arguments.length; ++i) {
        if (typeof arguments[i] === 'function') {
          callback = arguments[i];
        } else if (typeof arguments[i] === 'object') {
          if ('stopPropagation' in arguments[i] && 'preventDefault' in arguments[i]) {
            event = arguments[i];
          } else {
            options = arguments[i];
          }
        }
      }

      if (event && !this._preventDuplicateSubmission(event)) {
        return;
      }

      options = _.extend({
        set: true,
        validate: true
      },options || {});
  
      var attributes = options.attributes || {};
      
      //callback has context of element
      eachNamedInput.call(this, options, function() {
        var value = getInputValue.call(this);
        if (typeof value !== 'undefined') {
          objectAndKeyFromAttributesAndName(attributes, this.name, {mode: 'serialize'}, function(object, key) {
            object[key] = value;
          });
        }
      });
  
      this.trigger('serialize', attributes);

      if (options.validate) {
        var errors = this.validateInput(attributes) || [];
        this.trigger('validate', attributes, errors);
        if (errors.length) {
          this.trigger('error', errors);
          return;
        }
      }
  
      if (options.set && this.model) {
        if (!this.model.set(attributes, {silent: true})) {
          return false;
        };
      }
      
      callback && callback.call(this, attributes, _.bind(resetSubmitState, this));
      return attributes;
    },

    _preventDuplicateSubmission: function(event, callback) {
      event.preventDefault();

      var form = $(event.target);
      if ((event.target.tagName || '').toLowerCase() !== 'form') {
        // Handle non-submit events by gating on the form
        form = $(event.target).closest('form');
      }

      if (!form.attr('data-submit-wait')) {
        form.attr('data-submit-wait', 'true');
        if (callback) {
          callback.call(this, event);
        }
        return true;
      } else {
        return false;
      }
    },

  
    //populate a form from the passed attributes or this.model if present
    populate: function(attributes) {
      if (!this.$('form').length) {
        return;
      }
      var value, attributes = attributes || getContext.call(this, this.model);
      
      //callback has context of element
      eachNamedInput.call(this, {}, function() {
        objectAndKeyFromAttributesAndName.call(this, attributes, this.name, {mode: 'populate'}, function(object, key) {
          if (object && typeof (value = object[key]) !== 'undefined') {
            //will only execute if we have a name that matches the structure in attributes
            if (this.type === 'checkbox' && _.isBoolean(value)) {
              this.checked = value;
            } else if (this.type === 'checkbox' || this.type === 'radio') {
              this.checked = value == this.value;
            } else {
              this.value = value;
            }
          }
        });
      });

      this.trigger('populate', attributes);
    },
  
    //perform form validation, implemented by child class
    validateInput: function() {},
  
    destroy: function() {
      this.freeze();
      this.trigger('destroyed');
      if (this.undelegateEvents) {
        this.undelegateEvents();
      }
      this.unbind();
      this._events = {};
      this._boundCollectionsByCid = {};
      this.el = null;
      this.collection = null;
      this.model = null;
      delete _viewsIndexedByCid[this.cid];
      destroyChildViews.call(this);
    },

    scrollTo: function(x, y) {
      y = y || minimumScrollYOffset;
      function _scrollTo() {
        window.scrollTo(x, y);
      }
      if ($.os && $.os.ios) {
        // a defer is required for ios
        _.defer(_scrollTo);
      } else {
        _scrollTo();
      }
      return [x, y];
    },

    scrollToTop: function() {
      // android will use height of 1 because of minimumScrollYOffset
      return this.scrollTo(0, 0);
    }
  }, {
    registerHelper: function(name, callback) {
      this[name] = callback;
      Handlebars.registerHelper(name, this[name]);
    },
    registerMixin: function(name, callback, methods) {
      Thorax.registry.Mixins[name] = [callback, methods];
    },
    mixins: [],
    mixin: function(mixin) {
      this.mixins.push(mixin);
    },
    //events for all views
    events: {
      model: {},
      collection: {}
    },
    registerEvents: function(events) {
      for(var name in events) {
        if (name === 'model' || name === 'collection') {
          for (var _name in events[name]) {
            addEvent(this.events[name], _name, events[name][_name]);
          }
        } else {
          addEvent(this.events, name, events[name]);
        }
      }
    },
    unregisterEvents: function(events) {
      if (typeof events === 'undefined') {
        this.events = {
          model: {},
          collection: {}
        };
      } else if (typeof events === 'string' && arguments.length === 1) {
        if (events === 'model' || events === 'collection') {
          this.events[events] = {};
        } else {
          this.events[events] = [];
        }
      //remove collection or model events
      } else if (arguments.length === 2) {
        this.events[arguments[0]][arguments[1]] = [];
      }
    }
  });

  function cloneEvents(source, target, key) {
    source[key] = _.clone(target[key]);
    //need to deep clone events array
    _.each(source[key], function(value, _key) {
      if (_.isArray(value)) {
        target[key][_key] = _.clone(value);
      }
    });
  }

  var internalEvents = {
    //built in dom events
    'submit form': function(event) {
      // Hide any virtual keyboards that may be lingering around
      var focused = $(':focus')[0];
      focused && focused.blur();
    },

    'initialize:after': function(options) {
      //bind model or collection if passed to constructor
      if (options && options.model) {
        this.setModel(options.model);
      }
    },

    error: function() {  
      resetSubmitState.call(this);
    
      // If we errored with a model we want to reset the content but leave the UI
      // intact. If the user updates the data and serializes any overwritten data
      // will be restored.
      if (this.model && this.model.previousAttributes) {
        this.model.set(this.model.previousAttributes(), {
          silent: true
        });
      }
    },
    deactivated: function() {
      resetSubmitState.call(this);
    },
    model: {
      error: function(model, errors){
        if (this._modelOptions.errors) {
          this.trigger('error', errors);
        }
      },
      change: function() {
        onModelChange.call(this);
      }
    },
    collection: {
      add: function(model, collection) {
        var collection_element = getCollectionElement.call(this, collection);
        if (collection.length === 1) {
          if(collection_element.length) {
            collection_element.empty();
          }
          if (this._collectionOptionsByCid[collection.cid].renderOnEmptyStateChange) {
            this.render();
          }
        }
        if (collection_element.length) {
          this.appendItem(collection, model, collection.indexOf(model), {
            collectionElement: collection_element
          });
        }
      },
      remove: function(model, collection) {
        var collection_element = getCollectionElement.call(this, collection);
        collection_element.find('[' + model_cid_attribute_name + '="' + model.cid + '"]').remove();
        for (var cid in this._views) {
          if (this._views[cid].model && this._views[cid].model.cid === model.cid) {
            this._views[cid].destroy();
            delete this._views[cid];
            break;
          }
        }
        if (collection.length === 0) {
          if (collection_element.length) {
            appendEmpty.call(this, collection);
          }
          if (this._collectionOptionsByCid[collection.cid].renderOnEmptyStateChange) {
            this.render();
          }
        }
      },
      reset: function(collection) {
        onCollectionReset.call(this, collection);
      },
      error: function(collection, message) {
        if (this._collectionOptionsByCid[collection.cid].errors) {
          this.trigger('error', message);
        }
      }
    }
  };
  internalEvents['click [' + call_method_attribute_name + ']'] = function(event) {
    var target = $(event.target);
    event.preventDefault();
    this[target.attr(call_method_attribute_name)].call(this, event);
  };
  View.registerEvents(internalEvents);
  
  var viewTemplateOverrides = {};
  View.registerHelper('view', function(view, options) {
    if (!view) {
      return '';
    }
    var instance = this._view.view(view, options ? options.hash : {}),
        placeholder_id = instance.cid + '-' + _.uniqueId('placeholder');
    if (options.fn) {
      viewTemplateOverrides[placeholder_id] = options.fn;
    }
    return new Handlebars.SafeString('<div ' + view_placeholder_attribute_name + '="' + placeholder_id + '"></div>');
  });
  
  View.registerHelper('template', function(name, options) {
    var context = _.extend({}, this, options ? options.hash : {});
    var output = View.prototype.template.call(this._view, name, context);
    return new Handlebars.SafeString(output);
  });

  View.registerHelper('collection', function(collection, options) {
    //DEPRECATION: backwards compatibility with < 1.3
    if (arguments.length === 1) {
      options = collection;
      collection = this._view.collection;
    }
    //end DEPRECATION
    if (collection) {
      var collectionOptionsToExtend = {
        'item-template': options.fn && options.fn !== Handlebars.VM.noop ? options.fn : options.hash['item-template'],
        'empty-template': options.inverse && options.inverse !== Handlebars.VM.noop ? options.inverse : options.hash['empty-template'],
        'item-view': options.hash['item-view'],
        'empty-view': options.hash['empty-view']
      };
      ensureCollectionIsBound.call(this._view, collection, collectionOptionsToExtend);
      var collectionHelperOptions = _.clone(options.hash);
      _.keys(collectionOptionsToExtend).forEach(function(key) {
        delete collectionHelperOptions[key];
      });
      collectionHelperOptions[collection_cid_attribute_name] = collection.cid;
      if (collection.name) {
        collectionHelperOptions[collection_name_attribute_name] = collection.name;
      }
      return new Handlebars.SafeString(tag.call(this, collectionHelperOptions));
    } else {
      return '';
    }
  });

  View.registerHelper('empty', function(collection, options) {
    var empty;
    if (!options) {
      options = arguments[0];
      empty = !this._view.model || (this._view.model && !this._view.model.isEmpty());
    } else {
      if (!collection) {
        empty = true;
      } else {
        ensureCollectionIsBound.call(this._view, collection);
        empty = collection.isEmpty();
        this._view._collectionOptionsByCid[collection.cid].renderOnEmptyStateChange = true;
      }
    }
    if (empty) {
      this._view.trigger('rendered:empty', collection);
      return options.fn(this);
    } else {
      return options.inverse(this);
    }
  });

  View.registerHelper('url', function(url) {
    return (Backbone.history._hasPushState ? Backbone.history.options.root : '#') + url;
  });

  function tag(attributes, content) {
    var htmlAttributes = _.clone(attributes),
        tag = htmlAttributes.tag || htmlAttributes.tagName || 'div';
    if (htmlAttributes.tag) {
      delete htmlAttributes.tag;
    }
    if (htmlAttributes.tagName) {
      delete htmlAttributes.tagName;
    }
    if (htmlAttributes.call) {
      htmlAttributes[call_method_attribute_name] = htmlAttributes.call;
      delete htmlAttributes.tagName;
    }
    return '<' + tag + ' ' + _.map(htmlAttributes, function(value, key) {
      return key + '="' + value + '"';
    }).join(' ') + '>' + (content || '') + '</' + tag + '>';
  }

  //'selector' is not present in $('<p></p>')
  //TODO: investigage a better detection method
  function is$(obj) {
    return typeof obj === 'object' && ('length' in obj);
  }

  //private Thorax.View methods
  function getViewName(silent) {
    var name = this.name;
    if ((!name && !silent)) {
      throw new Error(this.cid + " requires a 'name' or 'template' attribute in order to be rendered.");
    } else if (name) {
      return name;
    }
  }

  function getValue(object, prop) {
    if (!(object && object[prop])) {
      return null;
    }
    return _.isFunction(object[prop]) ? object[prop]() : object[prop];
  }

  function ensureRendered() {
    !this._renderCount && this.render();
  }

  function ensureCollectionIsBound(collection, options) {
    if (!this._boundCollectionsByCid[collection.cid]) {
      this.bindCollection(collection, options);
    } else if (options) {
      _.extend(this._collectionOptionsByCid[collection.cid], options);
    }
  }

  function getContext(model) {
    if (typeof this.context === 'function') {
      return this.context(model);
    } else {
      var context = _.extend({}, (model && model.attributes) || {});
      _.each(this.context, function(value, key) {
        if (typeof value === 'function') {
          context[key] = value.call(this);
        } else {
          context[key] = value;
        }
      }, this);
      return context;
    }
  }

  function getTemplateContext(data) {
    var view_context = {};
    for (var key in this) {
      if (typeof this[key] !== 'function') {
        view_context[key] = this[key];
      }
    }
    return _.extend({}, view_context, data || {}, {
      cid: _.uniqueId('t'),
      _view: this
    });
  }

  function renderTemplate(file, data, ignoreErrors) {
    data = getTemplateContext.call(this, data);
    if (typeof file === 'function') {
      template = file;
    } else {
      template = this.loadTemplate(file, data, Thorax.registry);
    }
    if (!template) {
      if (ignoreErrors) {
        return ''
      } else {
        throw new Error('Unable to find template ' + file);
      }
    } else {
      return template(data);
    }
  }

  function onModelChange() {
    if (this._modelOptions.render) {
      this.render();
    }
    if (this._modelOptions.populate) {
      this.populate();
    }
  }

  function onCollectionReset(collection) {
    this.renderCollection(collection);
  }

  function containHandlerToCurentView(handler, cid) {
    return function(event) {
      var containing_view_element = $(event.target).closest('[' + view_name_attribute_name + ']');
      if (!containing_view_element.length || containing_view_element[0].getAttribute(view_cid_attribute_name) == cid) {
        handler(event);
      }
    };
  }

  //model/collection events, to be bound/unbound on setModel/setCollection
  function processModelOrCollectionEvent(events, type) {
    for (var _name in events[type] || {}) {
      if (_.isArray(events[type][_name])) {
        for (var i = 0; i < events[type][_name].length; ++i) {
          this._events[type].push([_name, bindEventHandler.call(this, events[type][_name][i])]);
        }
      } else {
        this._events[type].push([_name, bindEventHandler.call(this, events[type][_name])]);
      }
    }
  }

  //used by processEvents
  var domEvents = [
    'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout',
    'touchstart', 'touchend', 'touchmove',
    'click', 'dblclick',
    'keyup', 'keydown', 'keypress',
    'submit', 'change',
    'focus', 'blur'
  ];

  function bindEventHandler(callback) {
    var method = typeof callback === 'function' ? callback : this[callback];
    if (!method) {
      throw new Error('Event "' + callback + '" does not exist');
    }
    return _.bind(method, this);
  }

  function processEvents(events) {
    if (_.isFunction(events)) {
      events = events.call(this);
    }
    var processedEvents = [];
    for (var name in events) {
      if (name !== 'model' && name !== 'collection') {
        if (name.match(/,/)) {
          name.split(/,/).forEach(function(fragment) {
            processEventItem.call(this, fragment.replace(/(^[\s]+|[\s]+$)/g, ''), events[name], processedEvents);
          }, this);
        } else {
          processEventItem.call(this, name, events[name], processedEvents);
        }
      }
    }
    return processedEvents;
  }

  function processEventItem(name, handler, target) {
    if (_.isArray(handler)) {
      for (var i = 0; i < handler.length; ++i) {
        target.push(eventParamsFromEventItem.call(this, name, handler[i]));
      }
    } else {
      target.push(eventParamsFromEventItem.call(this, name, handler));
    }
  }

  var eventSplitter = /^(\S+)(?:\s+(.+))?/;

  function eventParamsFromEventItem(name, handler) {
    var params = {
      originalName: name,
      handler: typeof handler === 'string' ? this[handler] : handler
    };
    var match = eventSplitter.exec(name);
    params.name = match[1];
    if (isDOMEvent(params.name)) {
      params.type = 'DOM';
      params.name += '.delegateEvents' + this.cid;
      params.selector = match[2];
    } else {
      params.type = 'view';
    }
    return params;
  }

  function isDOMEvent(name) {
    return !(!name.match(/\s+/) && domEvents.indexOf(name) === -1);
  }

  //used by Thorax.View.registerEvents for global event registration
  function addEvent(target, name, handler) {
    if (!target[name]) {
      target[name] = [];
    }
    if (_.isArray(handler)) {
      for (var i = 0; i < handler.length; ++i) {
        target[name].push(handler[i]);
      }
    } else {
      target[name].push(handler);
    }
  }

  function resetSubmitState() {
    this.$('form').removeAttr('data-submit-wait');
  }

  //called with context of input
  function getInputValue() {
    if (this.type === 'checkbox' || this.type === 'radio') {
      if ($(this).attr('data-onOff')) {
        return this.checked;
      } else if (this.checked) {
        return this.value;
      }
    } else if (this.multiple === true) {
      var values = [];
      $('option',this).each(function(){
        if (this.selected) {
          values.push(this.value);
        }
      });
      return values;
    } else {
      return this.value;
    }
  }

  //calls a callback with the correct object fragment and key from a compound name
  function objectAndKeyFromAttributesAndName(attributes, name, options, callback) {
    var key, i, object = attributes, keys = name.split('['), mode = options.mode;
    for(i = 0; i < keys.length - 1; ++i) {
      key = keys[i].replace(']','');
      if (!object[key]) {
        if (mode == 'serialize') {
          object[key] = {};
        } else {
          return callback.call(this, false, key);
        }
      }
      object = object[key];
    }
    key = keys[keys.length - 1].replace(']', '');
    callback.call(this, object, key);
  }

  function eachNamedInput(options, iterator, context) {
    var i = 0;
    $('select,input,textarea', options.root || this.el).each(function() {
      if (this.type !== 'button' && this.type !== 'cancel' && this.type !== 'submit' && this.name && this.name !== '') {
        iterator.call(context || this, i, this);
        ++i;
      }
    });
  }

  function bindModelAndCollectionEvents(events) {
    if (!this._events) {
      this._events = {
        model: [],
        collection: []
      };
    }
    processModelOrCollectionEvent.call(this, events, 'model');
    processModelOrCollectionEvent.call(this, events, 'collection');
  }

  function getCollectionElement(collection) {
    //DEPRECATION: this._collectionSelector for backwards compatibility with < 1.3
    var selector = this._collectionSelector || '[' + collection_cid_attribute_name + '="' + collection.cid + '"]';
    var elements = this.$(selector);
    if (elements.length > 1) {
      //TODO: Zepto 1.0 should support jQuery style filter()
      var cid = this.cid;
      return $(_.filter(elements, function(element) {
        return cid === $(element).closest('[' + view_name_attribute_name + ']').attr(view_name_attribute_name);
      }));
    } else {
      return elements;
    }
  }

  function preserveCollectionElements(callback) {
    var old_collection_elements_by_cid = {},
        cid;
    for (cid in this._boundCollectionsByCid) {
      old_collection_elements_by_cid[cid] = getCollectionElement.call(this, this._boundCollectionsByCid[cid]);
    }
    callback.call(this);
    for (cid in this._boundCollectionsByCid) {
      var new_collection_element = getCollectionElement.call(this, this._boundCollectionsByCid[cid]),
          old_collection_element = old_collection_elements_by_cid[cid];
      if (old_collection_element.length && new_collection_element.length) {
        new_collection_element[0].parentNode.insertBefore(old_collection_element[0], new_collection_element[0]);
        new_collection_element[0].parentNode.removeChild(new_collection_element[0]);
      }
    }
  }

  function appendViews(scope) {
    var self = this;
    if (!self._views) {
      return;
    }
    _.toArray($('[' + view_placeholder_attribute_name + ']', scope || self.el)).forEach(function(el) {
      var placeholder_id = el.getAttribute(view_placeholder_attribute_name),
          cid = placeholder_id.replace(/\-placeholder\d+$/, '');
          view = self._views[cid];
      if (view) {
        //see if the {{#view}} helper declared an override for the view
        //if not, ensure the view has been rendered at least once
        if (viewTemplateOverrides[placeholder_id]) {
          view.render(viewTemplateOverrides[placeholder_id](getTemplateContext.call(view)));
        } else {
          ensureRendered.call(view);
        }
        el.parentNode.insertBefore(view.el, el);
        el.parentNode.removeChild(el);
      }
    });
  }

  function destroyChildViews() {
    for (var id in this._views || {}) {
      if (this._views[id].destroy) {
        this._views[id].destroy();
      }
      this._views[id] = null;
    }
  }

  function appendEmpty(collection) {
    var collection_element = getCollectionElement.call(this, collection).empty();
    this.appendItem(collection, this.renderEmpty(collection), 0, {
      silent: true,
      collectionElement: collection_element
    });
    this.trigger('rendered:empty', collection);
  }

  function applyMixin(mixin) {
    if (_.isArray(mixin)) {
      this.mixin.apply(this, mixin);
    } else {
      this.mixin(mixin);
    }
  }
  
  var Layout = Backbone.View.extend({
    events: {
      'click a': 'anchorClick'
    },
    destroyViews: true,
    _ensureElement : function() {
      Backbone.View.prototype._ensureElement.call(this);
      (this.el[0] || this.el).setAttribute(layout_cid_attribute_name, this.cid);      
    },

    setView: function(view, params){
      var old_view = this.view;
      if (view == old_view){
        return false;
      }
      this.trigger('change:view:start', view, old_view);
      old_view && old_view.trigger('deactivated');
      view && view.trigger('activated', params || {});
      if (old_view && old_view.el && old_view.el.parentNode) {
        $(old_view.el).remove();
      }
      //make sure the view has been rendered at least once
      view && ensureRendered.call(view);
      view && (this.el[0] || this.el).appendChild(view.el);
      window.scrollTo(0, minimumScrollYOffset);
      this.view = view;
      this.destroyViews && old_view && old_view.destroy();
      this.view && this.view.trigger('ready');
      this.trigger('change:view:end', view, old_view);
      return view;
    },

    anchorClick: function(event) {
      var target = $(event.currentTarget);
      if (target.attr("data-external")) {
        return;
      }
      //ensure nested layouts only trigger the behavior once
      var containing_view_element = target.closest('[' + layout_cid_attribute_name + ']');
      if (!containing_view_element.length || containing_view_element[0].getAttribute(layout_cid_attribute_name) == this.cid) {
        var href = target.attr("href");
        // Route anything that starts with # or / (excluding //domain urls)
        if (href && (href[0] === '#' || (href[0] === '/' && href[1] !== '/'))) {
          Backbone.history.navigate(href, {trigger: true});
          event.preventDefault();
        }
      }
    }
  });

  var Router = Backbone.Router.extend({
    view: function(name, attributes) {
      if (!Thorax.registry.Views[name]) {
        throw new Error('view: ' + name + ' does not exist.');
      }
      return new Thorax.registry.Views[name](attributes);
    },
    setView: function() {
      return Thorax.registry.setView.apply(scope.layout, arguments);
    }
  });

  var Model = Backbone.Model.extend({
    isEmpty: function() {
      return this.isPopulated();
    },
    isPopulated: function() {
      // We are populated if we have attributes set
      var attributes = _.clone(this.attributes);
      var defaults = _.isFunction(this.defaults) ? this.defaults() : (this.defaults || {});
      for (var default_key in defaults) {
        if (attributes[default_key] != defaults[default_key]) {
          return true;
        }
        delete attributes[default_key];
      }
      var keys = _.keys(attributes);
      return keys.length > 1 || (keys.length === 1 && keys[0] !== 'id');
    }
  });

  var Collection = Backbone.Collection.extend({
    model: Model,
    isEmpty: function() {
      if (this.length > 0) {
        return false;
      } else {
        return this.length === 0 && this.isPopulated();
      }
    },
    isPopulated: function() {
      return this._fetched || this.length > 0 || (!this.length && !getValue(this, 'url'));
    },
    fetch: function(options) {
      options = options || {};
      var success = options.success;
      options.success = function(collection, response) {
        collection._fetched = true;
        success && success(collection, response);
      };
      return Backbone.Collection.prototype.fetch.apply(this, arguments);
    },
    reset: function(models, options) {
      this._fetched = !!models;
      return Backbone.Collection.prototype.reset.call(this, models, options);
    }
  });

  //create the Thorax object
  var Thorax;
  this.Thorax = Thorax = {
    Layout: Layout,
    View: View,
    Model: Model,
    Collection: Collection,
    Router: Router,
    templatePathPrefix: ''
  };

  //if a "name" property is specified during extend set it on the registry
  //views need special property inheritence
  //routers will be treated as initialized singletons
  _.each({
    Model: 'Models',
    Collection: 'Collections',
    View: 'Views',
    Router: 'Routers'
  }, function(registryName, className) {
    Thorax[className].extend = function(protoProps, classProps) {
      var child = Backbone[className].extend.call(this, protoProps, classProps);
      if (child.prototype.name) {
        Thorax.registry[registryName][child.prototype.name] = className === 'Router' ? new child : child;
      }
      if (className === 'View') {
        child.mixins = _.clone(this.mixins);
        cloneEvents(this, child, 'events');
        cloneEvents(this.events, child.events, 'model');
        cloneEvents(this.events, child.events, 'collection');
      }
      return child;
    };
  });


  Thorax.registry = {
    templates: {},
    Views: {},
    Mixins: {},
    Models: {},
    Collections: {},
    Routers: {}
  };

  Thorax.Application = Layout.extend({
    initialize: function(options) {
      //DEPRECATION: backwards compatibility with < 1.3
      _.extend(this, Thorax.registry);

      //ensure backbone history has started
      Backbone.history || (Backbone.history = new Backbone.History);
      _.extend(this, {
        Layout: Layout.extend({
          application: this
        }),
        View: View.extend({
          application: this
        }),
        Model: Model.extend({
          application: this
        }),
        Collection: Collection.extend({
          application: this
        }),
        Router: Router.extend({
          application: this
        })
      });

      _.extend(this, options || {});
    },
    start: function(options) {
      if (!Backbone.History.started) {
        Backbone.history.start(options);
      }
      this.trigger('ready', options);
    }
  });

  //jquery and zepto plugins
  _.extend($.fn, {
    view: function() {
      var el = $(this).closest('[' + view_name_attribute_name + ']');
      return (el && _viewsIndexedByCid[el.attr(view_name_attribute_name)]) || false;
    },
    model: function() {
      var $this = $(this),
          modelElement = $this.closest('[' + model_cid_attribute_name + ']'),
          modelCid = modelElement && modelElement.attr(model_cid_attribute_name);
      if (modelCid) {
        var view = $this.view();
        if (view && view.model && view.model.cid === modelCid) {
          return view.model || false;
        }
        var collection = $this.collection(view);
        if (collection) {
          return collection._byCid[modelCid] || false;
        }
      }
      return false;
    },
    collection: function(view) {
      var $this = $(this),
          collectionElement = $this.closest('[' + collection_cid_attribute_name + ']'),
          collectionCid = collectionElement && collectionElement.attr(collection_cid_attribute_name);
      if (collectionCid) {
        view = view || $this.view();
        if (view) {
          return view._boundCollectionsByCid[collectionCid];
        }
      }
      return false;
    }
  });

}).call(this);
