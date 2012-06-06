//TODO: fix failing nested keyword events 

$(function() {

  Thorax.configure({
    templatePathPrefix: ''
  });

  Application.templates = {
    'letter.handlebars': Handlebars.compile('{{collection tag="ul"}}'), 
    'letter-item.handlebars': Handlebars.compile("<li>{{letter}}</li>"),
    'letter-empty.handlebars': Handlebars.compile("<li>empty</li>"),
    'letter-multiple-item.handlebars': Handlebars.compile("<li>{{letter}}</li><li>{{letter}}</li>"),
    'parent.handlebars': Handlebars.compile("<div>{{view child}}</div>"),
    'child.handlebars': Handlebars.compile("<div>{{value}}</div>"),
    'form.handlebars': Handlebars.compile('<form><input name="one"/><select name="two"><option value="a">a</option><option value="b">b</option></select><input name="three[four]"/></form>')
  };

  var LetterModel = Thorax.Model.extend({});

  var letterCollection = new Thorax.Collection(['a','b','c','d'].map(function(letter) {
    return {letter: letter};
  }));

  var LetterCollectionView = Thorax.View.extend({
    name: 'letter'
  });

  var LetterItemView = Thorax.View.extend({
    name: 'letter-item'
  });

  var LetterEmptyView = Thorax.View.extend({
    name: 'letter-empty'
  });

  test("isPopulated()", function() {
    ok(letterCollection.isPopulated());
    ok(letterCollection.at(0).isPopulated());
  });

  test("Model View binding", function() {
    var a = new LetterItemView({
      model: letterCollection.at(0)
    });
    equal(a.el.firstChild.innerHTML, 'a', 'set via constructor');

    var b = new LetterItemView();
    b.setModel(letterCollection.at(1));
    equal(b.el.firstChild.innerHTML, 'b', 'set via setModel');

    letterCollection.at(1).set({letter: 'B'});
    equal(b.el.firstChild.innerHTML, 'B', 'update attribute triggers render');

    b.freeze();
    letterCollection.at(1).set({letter: 'b'});
    equal(b.el.firstChild.innerHTML, 'B', 'freeze disables render on update');

    var c = new LetterItemView();
    c.setModel(letterCollection.at(2), {
      render: false
    });
    ok(!c.el.firstChild, 'did not render');
    c.render();
    equal(c.el.firstChild.innerHTML, 'c', 'manual render');
  });

  //DEPRECATION: supports syntax for < 1.3
  test("Collection View binding", function() {
    function runCollectionTests(view, indexMultiplier) {
      function matchCids(collection) {
        collection.forEach(function(model) {
          equal(view.$('[data-model-cid="' + model.cid + '"]').length, 1 * indexMultiplier, 'match CIDs');
        });
      }

      ok(!view.el.firstChild, 'no render until setCollection');
      var clonedLetterCollection = new Thorax.Collection(letterCollection.models),
          renderedItemCount = 0,
          renderedCollectionCount = 0,
          renderedEmptyCount = 0,
          renderedCount = 0;

      view.on('rendered', function() {
        ++renderedCount;
      });
      view.on('rendered:collection', function() {
        ++renderedCollectionCount;
      });
      view.on('rendered:item', function() {
        ++renderedItemCount;
      });
      view.on('rendered:empty', function() {
        ++renderedEmptyCount;
      });

      view.setCollection(clonedLetterCollection);
      equal(view.$('li').length, 4 * indexMultiplier, 'rendered node length matches collection length');
      equal(view.$('li')[0 * indexMultiplier].innerHTML + view.$('li')[3 * indexMultiplier].innerHTML, 'ad', 'rendered nodes in correct order');
      equal(renderedCount, 1, 'rendered event count');
      equal(renderedCollectionCount, 1, 'rendered:collection event count');
      equal(renderedItemCount, 4, 'rendered:item event count');
      equal(renderedEmptyCount, 0, 'rendered:empty event count');
      matchCids(clonedLetterCollection);

      //reorder
      clonedLetterCollection.remove(clonedLetterCollection.at(0));
      equal(view.$('li')[0 * indexMultiplier].innerHTML + view.$('li')[2 * indexMultiplier].innerHTML, 'bd', 'rendered nodes in correct order');
      clonedLetterCollection.remove(clonedLetterCollection.at(2));
      equal(view.$('li')[0 * indexMultiplier].innerHTML + view.$('li')[1 * indexMultiplier].innerHTML, 'bc', 'rendered nodes in correct order');
      clonedLetterCollection.add(new LetterModel({letter: 'e'}));
      equal(view.$('li')[2 * indexMultiplier].innerHTML, 'e', 'collection and nodes maintain sort order');
      clonedLetterCollection.add(new LetterModel({letter: 'a'}), {at: 0});
      equal(view.$('li')[0 * indexMultiplier].innerHTML, 'a', 'collection and nodes maintain sort order');
      equal(renderedCount, 1, 'rendered event count');
      equal(renderedCollectionCount, 1, 'rendered:collection event count');
      equal(renderedItemCount, 6, 'rendered:item event count');
      equal(renderedEmptyCount, 0, 'rendered:empty event count');
      matchCids(clonedLetterCollection);

      //empty
      clonedLetterCollection.remove(clonedLetterCollection.models);
      equal(view.$('li')[0].innerHTML, 'empty', 'empty collection renders empty');
      clonedLetterCollection.add(new LetterModel({letter: 'a'}));
      equal(view.$('li').length, 1 * indexMultiplier, 'transition from empty to one item');
      equal(view.$('li')[0 * indexMultiplier].innerHTML, 'a', 'transition from empty to one item');
      equal(renderedCount, 1, 'rendered event count');
      equal(renderedCollectionCount, 1, 'rendered:collection event count');
      equal(renderedItemCount, 7, 'rendered:item event count');
      equal(renderedEmptyCount, 1, 'rendered:empty event count');
      matchCids(clonedLetterCollection);

      var oldLength = view.$('li').length;
      clonedLetterCollection.reset(clonedLetterCollection.models);
      equal(oldLength, view.$('li').length, 'Reset does not cause change in number of rendered items')

      //freeze
      view.freeze();
      clonedLetterCollection.remove(clonedLetterCollection.models);
      equal(renderedEmptyCount, 1, 'rendered:empty event count');
      equal(view.$('li')[0 * indexMultiplier].innerHTML, 'a', 'transition from empty to one item');
    }

    runCollectionTests(new LetterCollectionView(), 1);

    var viewReturningItemView = new (LetterCollectionView.extend({
      renderItem: function(model, i) {
        return new LetterItemView({model: model});
      }
    }));
    runCollectionTests(viewReturningItemView, 1);

    var viewReturningMixed = new (LetterCollectionView.extend({
      renderItem: function(model, i) {
        return i % 2 === 0 ? new LetterItemView({model: model}) : this.template(this.name + '-item', model.attributes);
      }
    }));
    runCollectionTests(viewReturningMixed, 1);

    var viewReturningMultiple = new (LetterCollectionView.extend({
      renderItem: function(model, i) {
        return this.template('letter-multiple-item', model.attributes);
      }
    }));
    runCollectionTests(viewReturningMultiple, 2);

    var viewWithBlockCollectionHelper = new Thorax.View({
      template: '{{#collection tag="ul" empty-template="letter-empty"}}<li>{{letter}}</li>{{/collection}}'
    });
    runCollectionTests(viewWithBlockCollectionHelper, 1);

    var viewWithBlockCollectionHelperWithViews = new Thorax.View({
      template: '{{collection tag="ul" empty-template="letter-empty" item-view="letter-item"}}'
    });
    runCollectionTests(viewWithBlockCollectionHelperWithViews, 1);

    var viewWithBlockCollectionHelperWithViewsAndBlock = new Thorax.View({
      template: '{{#collection tag="ul" empty-template="letter-empty" item-view="letter-item"}}<li class="testing">{{letter}}</li>{{/collection}}'
    });
    runCollectionTests(viewWithBlockCollectionHelperWithViewsAndBlock, 1);

    var viewWithCollectionHelperWithEmptyView = new Thorax.View({
      template: '{{collection tag="ul" empty-view="letter-empty" item-template="letter-item"}}'
    });
    runCollectionTests(viewWithCollectionHelperWithEmptyView, 1);

    var viewWithCollectionHelperWithEmptyViewAndBlock = new Thorax.View({
      template: '{{collection tag="ul" empty-templatve="letter-empty" empty-view="letter-empty" item-template="letter-item"}}'
    });
    runCollectionTests(viewWithCollectionHelperWithEmptyViewAndBlock, 1);
  });

  test("multiple collections", function() {
    var view = new Thorax.View({
      template: '{{collection a tag="ul" item-template="letter-item"}}{{collection b tag="ul" item-template="letter-item"}}',
      a: new Thorax.Collection(letterCollection.models),
      b: new Thorax.Collection(letterCollection.models)
    });
    view.render();
    equal(view.$('li').length, letterCollection.models.length * 2);
  });

  test("inverse block in collection helper", function() {
    var emptyCollectionView = new Thorax.View({
      template: '{{#collection}}<div>{{letter}}</div>{{else}}<div>empty</div>{{/collection}}',
      collection: new Thorax.Collection()
    });
    emptyCollectionView.render();
    equal(emptyCollectionView.$('[data-collection-cid]').html(), '<div>empty</div>');
  });

  test("nested collection helper", function() {
    var blogModel = new Thorax.Model();
    Thorax.View.extend({
      name: 'Comments',
      template: '{{#collection comments}}<p>{{comment}}</p>{{/collection}}'
    });
    var view = new Thorax.View({
      template: '{{#empty posts}}empty{{else}}{{#collection posts name="outer"}}<h2>{{title}}</h2>{{view "Comments" comments=comments}}</div>{{/collection}}{{/empty}}',
      model: blogModel
    });
    equal(view.html(), 'empty');
    var comments1 = new Thorax.Collection([
      new Thorax.Model({comment: 'comment one'}),
      new Thorax.Model({comment: 'comment two'})
    ]);
    var comments2 = new Thorax.Collection([
      new Thorax.Model({comment: 'comment three'}),
      new Thorax.Model({comment: 'comment four'})
    ]);
    blogModel.set({
      posts: new Thorax.Collection([
        new Thorax.Model({
          title: 'title one',
          comments: comments1
        }),
        new Thorax.Model({
          title: 'title two',
          comments: comments2
        })
      ])
    });
    equal(view.$('h2').length, 2);
    equal(view.$('h2')[0].innerHTML, 'title one');
    equal(view.$('h2')[1].innerHTML, 'title two');
    equal(view.$('p').length, 4);
    equal(view.$('p')[0].innerHTML, 'comment one');
    equal(view.$('p')[1].innerHTML, 'comment two');
    equal(view.$('p')[2].innerHTML, 'comment three');
    equal(view.$('p')[3].innerHTML, 'comment four');

    comments2.add(new Thorax.Model({comment: 'comment five'}));
    equal(view.$('p')[4].innerHTML, 'comment five');

    blogModel.attributes.posts.add(new Thorax.Model({
      title: 'title three'
    }));
    equal(view.$('h2').length, 3);
    equal(view.$('h2')[2].innerHTML, 'title three');
  });

  test("graceful failure of empty collection with no empty template", function() {
    var view = new Thorax.View({
      template: '{{collection item-template="letter-item"}}',
      collection: new Thorax.Collection({
        isPopulated: function() {
          return true;
        }
      })
    });
    view.render();
    view = new Thorax.View({
      template: '{{collection item-template="letter-item"}}',
      collection: new Thorax.Collection
    });
    view.render();
    ok(true);
  });

  test("empty helper", function() {
    var emptyView = new Thorax.View({
      template: '{{#empty}}empty{{else}}not empty{{/empty}}'
    });
    emptyView.render();
    equal(emptyView.html(), 'empty');
    var emptyModelView = new Thorax.View({
      template: '{{#empty}}empty{{else}}not empty{{/empty}}',
      model: new Thorax.Model()
    });
    emptyModelView.render();
    equal(emptyModelView.html(), 'empty');
    emptyModelView.model.set({key: 'value'});
    equal(emptyModelView.html(), 'not empty');
    var emptyCollectionView = new Thorax.View({
      template: '{{#empty myCollection}}empty{{else}}not empty{{/empty}}',
      myCollection: new Thorax.Collection()
    });
    emptyCollectionView.render();
    equal(emptyCollectionView.html(), 'empty');
    var model = new Thorax.Model();
    emptyCollectionView.myCollection.add(model);
    equal(emptyCollectionView.html(), 'not empty');
    emptyCollectionView.myCollection.remove(model);
    equal(emptyCollectionView.html(), 'empty');
  });

  test("Child views", function() {
    var childRenderedCount = 0,
        parentRenderedCount = 0;
    var Child = Thorax.View.extend({
      name: 'child',
      events: {
        rendered: function() {
          ++childRenderedCount;
        }
      }
    });
    var Parent = Thorax.View.extend({
      name: 'parent',
      events: {
        rendered: function() {
          ++parentRenderedCount;
        }
      },
      initialize: function() {
        this.childModel = new Thorax.Model({
          value: 'a'
        });
        this.child = this.view('child', {
          model: this.childModel
        });
      }
    });
    var parent = new Parent();
    parent.render();
    equal(parent.$('[data-view-name="child"] > div').html(), 'a', 'view embedded');
    equal(parentRenderedCount, 1);
    equal(childRenderedCount, 1);
  
    parent.render();
    equal(parent.$('[data-view-name="child"] > div').html(), 'a', 'view embedded');
    equal(parentRenderedCount, 2, 're-render of parent does not render child');
    equal(childRenderedCount, 1, 're-render of parent does not render child');
  
    parent.childModel.set({value: 'b'});
    equal(parent.$('[data-view-name="child"] > div').html(), 'b', 'view embedded');
    equal(parentRenderedCount, 2, 're-render of child does not parent child');
    equal(childRenderedCount, 2, 're-render of child does not render parent');
  
    //ensure recursion does not happen when child view has the same model
    //as parent
    parent.setModel(parent.childModel);
    parent.model.set({value: 'c'});
    equal(parentRenderedCount, 4);
    equal(childRenderedCount, 3);
  });
  
  test("Template not found handling", function() {
    var view = new Thorax.View();
    equal('', view.template('foo', {}, true));
    raises(function() {
      view.template('foo');
    });
  });
  
  test("render() subclassing", function() {
    var a = new Thorax.View({
      render: function() {
        Thorax.View.prototype.render.call(this, '<p>a</p>');
      }
    });
    a.render();

    var b = new Thorax.View({
      render: function() {
        Thorax.View.prototype.render.call(this, $('<p>b</p>'));
      }
    });
    b.render();

    var c = new Thorax.View({
      render: function() {
        var el = document.createElement('p');
        el.innerHTML = 'c';
        Thorax.View.prototype.render.call(this, el);
      }
    });
    c.render();

    var d = new Thorax.View({
      render: function() {
        var view = new Thorax.View({
          render: function() {
            Thorax.View.prototype.render.call(this, '<p>d</p>');
          }
        });
        view.render();
        Thorax.View.prototype.render.call(this, view);
      }
    });
    d.render();

    equal(a._renderCount, 1, '_renderCount incrimented');
    equal(b._renderCount, 1, '_renderCount incrimented');
    equal(c._renderCount, 1, '_renderCount incrimented');
    equal(d._renderCount, 1, '_renderCount incrimented');
    equal(a.$('p').html(), 'a', 'parent render accepts string');
    equal(b.$('p').html(), 'b', 'parent render accepts dom array');
    equal(c.$('p').html(), 'c', 'parent render accepts dom element');
    equal(d.$('p').html(), 'd', 'parent render accepts view');
  });

  test("template passed to constructor and view block", function() {
    var view = new Thorax.View({
      template: '<p>{{key}}</p>',
      key: 'value'
    });
    view.render();
    equal(view.$('p').html(), 'value');

    var view = new (Thorax.View.extend({
      template: '<p>{{key}}</p>',
      key: 'value'
    }));
    view.render();
    equal(view.$('p').html(), 'value');

    var Child = Thorax.View.extend({
      template: '<div class="child-a">{{key}}</div>',
      key: 'value'
    });

    var a = new Child;
    var b = new Child;

    var parent = new Thorax.View({
      template: '<div class="parent">{{#view b}}<div class="child-b">{{key}}</div>{{/view}}{{view a}}</div>',
      a: a,
      b: b
    });
    parent.render();
    equal(parent.$('.child-a').html(), 'value');
    equal(parent.$('.child-b').html(), 'value');

    //ensure that override does not persist to view itself
    b.render();
    equal(b.$('.child-a').html(), 'value');

    //test nesting
    var outer = new Thorax.View({
      template: '<div class="a">{{#view inner}}<div class="b">{{#view child}}<div class="c">value</div>{{/view}}</div>{{/view}}</div>',
      inner: new Thorax.View({
        child: new Thorax.View
      })
    });
    outer.render();
    equal(outer.$('.c').html(), 'value');
  });
  
  test("Inheritable events", function() {
    var Parent = Thorax.View.extend({}),
        aCount = 0,
        bCount = 0;
    Parent.registerEvents({
      a: function() {
        ++aCount;
      }
    });
    var Child = Parent.extend({});
    Child.registerEvents({
      b: function() {
        ++bCount;
      }
    });
    var parent = new Parent(),
        child = new Child();
    parent.trigger('a');
    parent.trigger('b');
    child.trigger('a');
    child.trigger('b');
    equal(aCount, 2);
    equal(bCount, 1);
  
    //ensure events are properly cloned
    Parent = Thorax.View.extend();
    Parent.registerEvents({
      a: 1
    });
  
    Child = Parent.extend({});
    Child.registerEvents({
      a: 2
    });
    
    var ChildTwo = Parent.extend({});
  
    equal(Child.events.a[0], 1, 'ensure events are not shared between children');
    equal(Child.events.a.length, 2, 'ensure events are not shared between children');
    equal(ChildTwo.events.a[0], 1, 'ensure events are not shared between children');
    equal(ChildTwo.events.a.length, 1, 'ensure events are not shared between children');
  });

  test("Multiple event registration", function() {
    var view = new Thorax.View(), a = 0, b = 0, c = 0, d = 0, e = 0;
    view.registerEvents({
      'a,b': function() {
        ++a;
        ++b;
      },
      'c': [
        function() {
          ++c;
        },
        function() {
          ++c;
        }
      ],
      'd,e': [
        function() {
          ++d;
        },
        function() {
          ++e;
        }
      ]
    });
    view.trigger('a');
    view.trigger('b c');
    view.trigger('d e');
    equal(a, 2);
    equal(b, 2);
    equal(c, 2);
    equal(d, 2);
    equal(e, 2);
  });
    
  test("dom events and containHandlerToCurrentView", function() {
    
    var childClickedCount = 0,
        parentClickedCount = 0;
    
    var Child = Thorax.View.extend({
      name: 'child',
      events: {
        'click div': function() {
          ++childClickedCount;
        }
      }
    });
    
    var Parent = Thorax.View.extend({
      name: 'parent',
      events: {
        'click div': function() {
          ++parentClickedCount;
        }
      },
      initialize: function() {
        this.child = this.view('child', {
          value: 'a'
        });
      }
    });
    
    var parent = new Parent();
    parent.render();
    document.body.appendChild(parent.el);
  
    $(parent.$('div')[0]).trigger('click');
    equal(parentClickedCount, 1);
    equal(childClickedCount, 0);
    
    parent.child.$('div').trigger('click');
    equal(parentClickedCount, 1);
    equal(childClickedCount, 1);
  
    $(parent.el).remove();

    var ParentWithNested = Parent.extend({
      events: {
        'nested click div': function() {
          ++parentClickedCount;
        }
      }
    });
    parent = new ParentWithNested();
    parent.render();
    document.body.appendChild(parent.el);
    $(parent.el).trigger('click');
    $(parent.child.el).trigger('click');
    equal(parentClickedCount, 4, 'test nested keyword');
    equal(childClickedCount, 2, 'test nested keyword');
    $(parent.el).remove();

    //test nested view events
    var testTriggerCount = 0;
    Parent = Thorax.View.extend({
      events: {
        'nested test': function() {
          ++testTriggerCount;
          equal(this.cid, parent.cid, 'scope is always the declaring view');
        }
      },
      initialize: function() {
        this.view(this.child = new Thorax.View());
        this.child.view(this.child.child = new Thorax.View());
      }
    });
    parent = new Parent();
    parent.trigger('test');
    parent.child.trigger('test');
    parent.child.child.trigger('test');
    equal(testTriggerCount, 3, 'test nested view events');
  });
  
  test("serialize() / populate()", function() {
    var FormView = Thorax.View.extend({
      name: 'form'
    });
  
    var model = new Thorax.Model({
      one: 'a',
      two: 'b',
      three: {
        four: 'c'
      }
    });
  
    var view = new FormView();
    view.render();
    var attributes = view.serialize();
    equal(attributes.one, "", 'serialize empty attributes');
    view.setModel(model);
    attributes = view.serialize();
    equal(attributes.one, 'a', 'serialize attributes from model');
    equal(attributes.two, 'b', 'serialize attributes from model');
    equal(attributes.three.four, 'c', 'serialize attributes from model');
  
    view.populate({
      one: 'aa',
      two: 'b',
      three: {
        four: 'cc'
      }
    });
    attributes = view.serialize();
    equal(attributes.one, 'aa', 'serialize attributes from populate()');
    equal(attributes.two, 'b', 'serialize attributes from populate()');
    equal(attributes.three.four, 'cc', 'serialize attributes from populate()');
  
    view.validateInput = function() {
      return ['error'];
    };
    var errorCallbackCallCount = 0;
    view.bind('error', function() {
      ++errorCallbackCallCount;
    });
    ok(!view.serialize());
    equal(errorCallbackCallCount, 1, "error event triggered when validateInput returned errors");
  });
  
  test("Test thorax.layout", function() {
    var a = new Thorax.View({
      render: function() {
        Thorax.View.prototype.render.call(this, 'a');
      }
    });
    var aEventCounter = {};
    a.bind('all', function(eventName) {
      aEventCounter[eventName] || (aEventCounter[eventName] = 0);
      ++aEventCounter[eventName];
    });
  
    var b = new Thorax.View({
      render: function() {
        Thorax.View.prototype.render.call(this, 'b');
      }
    });
    var bEventCounter = {};
    b.bind('all', function(eventName) {
      bEventCounter[eventName] || (bEventCounter[eventName] = 0);
      ++bEventCounter[eventName];
    });
  
    ok(!Application.layout.view, 'layout does not start with a view');
  
    Application.layout.setView(a);
    equal(Application.layout.view, a, 'layout sets view');
    ok(Application.layout.$('[data-view-name]').length, 'layout updates HTML')
  
    b.render();
    Application.layout.setView(b);
    equal(Application.layout.view, b, 'layout sets view');
  
    //lifecycle checks
    equal(aEventCounter.rendered, 1);
    equal(aEventCounter.activated, 1);
    equal(aEventCounter.ready, 1);
    equal(aEventCounter.deactivated, 1);
    equal(aEventCounter.destroyed, 1);
  
    equal(bEventCounter.rendered, 1);
    equal(bEventCounter.activated, 1);
    equal(bEventCounter.ready, 1);
    ok(!bEventCounter.deactivated);
    ok(!bEventCounter.destroyed);

    Application.layout.setView(false);
    ok(!Application.layout.view, 'layout can set to empty view');
    equal(bEventCounter.rendered, 1);
    equal(bEventCounter.activated, 1);
    equal(bEventCounter.ready, 1);
    equal(bEventCounter.deactivated, 1);
    equal(bEventCounter.destroyed, 1);
  });

});
