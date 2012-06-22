$(function() {

  var Application = new Thorax.Application();

  test("serialize() / populate()", function() {
    var FormView = Application.View.extend({
      name: 'form',
      template: Handlebars.compile('<form><input name="one"/><select name="two"><option value="a">a</option><option value="b">b</option></select><input name="three[four]"/><input name="five" value="A" type="checkbox" /><input name="five" value="B" type="checkbox" checked /><input name="five" value="C" type="checkbox" checked /><input name="six" value="LOL" type="checkbox" checked /></form>')
    });
  
    var model = new Application.Model({
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
    deepEqual(attributes.five, ['B', 'C'], 'serialize empty attributes');
    equal(attributes.six, 'LOL', 'serialize empty attributes');
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

  test("validations", function() {
    var lastErrors;

    var regexValidationViewErrorCount = 0;
    var regexValidationView = new Application.View({
      events: {
        error: function(errors) {
          ++regexValidationViewErrorCount;
          lastErrors = errors;
        }
      },
      template: '<form><input name="a" data-validate-regex="^a"></form>'
    });
    regexValidationView.render();
    regexValidationView.populate({
      a: 'a'
    });
    equal(regexValidationView.serialize().a, 'a');
    equal(regexValidationViewErrorCount, 0);
    regexValidationView.populate({
      a: 'b'
    });
    ok(!regexValidationView.serialize());
    equal(regexValidationViewErrorCount, 1);
    equal(lastErrors[0].label, 'a');

    var methodValidationView = new Application.View({
      events: {
        error: function(errors) {
          lastErrors = errors;
        }
      },
      template: '<form><label for="a">label<input id="a" name="a" data-validate-method="myMethod"></label></form>',
      myMethod: function(value) {
        return value !== 'a' ? 'test {{label}}' : true;
      }
    });
    methodValidationView.render();
    methodValidationView.populate({
      a: 'a'
    });
    ok(methodValidationView.serialize());
    methodValidationView.populate({
      a: 'b'
    });
    ok(!methodValidationView.serialize());
    equal(lastErrors[0].message, 'test label');
    methodValidationView.populate({
      a: 'a'
    });
    ok(methodValidationView.serialize());
  });

  test("input helper", function(){
    var textInputView = new Application.View({
      key: 'value',
      template: '{{input type="text" class="test" value="{{key}}"}}'
    });
    textInputView.render();
    equal(textInputView.$('.test').val(), 'value');

    var textareaInputView = new Application.View({
      template: '{{input type="textarea" value="value"}}'
    });
    textareaInputView.render();
    equal(textareaInputView.$('textarea').val(), 'value');

    var selectView = new Application.View({
      optionsHash: {
        valueOne: 'Label One',
        valueTwo: 'Label Two'
      },
      optionsArray: [
        ['valueOne', 'Label One'],
        ['valueTwo', 'Label Two']
      ],
      template: '{{input name="a" type="select" options=optionsHash}}{{input name="b" type="select" options=optionsArray}}'
    });
    selectView.render();
    equal(selectView.$('select').length, 2);
    equal(selectView.$('option').length, 4);
    equal(selectView.$('select[name="a"]').find('option')[0].getAttribute('value'), 'valueOne');
  });

  test('input-error helper', function() {
    var inputErrorView = new Application.View({
      template: '{{input-error "a"}}{{input-error "b" tag="p" class="help-block"}}'
    });
    inputErrorView.render();
    equal(inputErrorView.$('span').length, 1);
    equal(inputErrorView.$('p').length, 1);
    inputErrorView.trigger('error', [
      {
        id: 'a',
        message: 'message one'
      },
      {
        id: 'b',
        message: 'message two'
      }
    ]);
    equal(inputErrorView.$('span').html(), 'message one');
    equal(inputErrorView.$('p').html(), 'message two');
    inputErrorView.reset();
    equal(inputErrorView.$('span').html(), '');
    equal(inputErrorView.$('p').html(), '');
  });

  test("control-group helper", function() {
    var controlGroupView = new Application.View({
      template: '{{#control-group name="a" label="hey"}}{{control-label}}{{control-input class="tasty"}}{{control-error}}{{/control-group}}'
    });
    controlGroupView.render();
    equal(controlGroupView.$('label').html(), 'hey');
    equal(controlGroupView.$('input.tasty').length, 1);
    equal(controlGroupView.$('.help-block').length, 1);
  });

  test("error helper", function() {
    var errorHelperView = new Application.View({
      template: '{{#error}}<p class="error-header">Some Errors</p><ul class="error-messages">{{#each errors}}<li>{{message}}</li>{{/each}}{{/error}}<form><input name="test" data-validate-required="true"></form>'
    });
    errorHelperView.render();
    equal(errorHelperView.$('.error-header').length, 0);
    ok(!errorHelperView.serialize());
    equal(errorHelperView.$('.error-header').length, 1);
    equal(errorHelperView.$('ul.error-messages li').length, 1);
    ok(!errorHelperView.serialize());
    equal(errorHelperView.$('.error-header').length, 1);
    equal(errorHelperView.$('ul.error-messages li').length, 1);
    errorHelperView.populate({test:'value'});
    ok(errorHelperView.serialize());
    equal(errorHelperView.$('.error-header').length, 0);
    equal(errorHelperView.$('ul.error-messages li').length, 0);
  });

  test("control group + validation", function() {
    var formView = new Application.View({
      template: '<form>{{#control-group name="a"}}{{control-error}}{{control-input data-validate-required="true"}}{{/control-group}}{{#control-group name="b"}}{{control-error}}{{control-input data-validate-min-length="3" data-error-message="too short"}}{{/control-group}}</form>'
    });
    formView.render();

    ok($(formView.$('.help-block')[0]).html() === '');
    ok(!formView.serialize());
    ok($(formView.$('.help-block')[0]).html() !== '');
    ok($(formView.$('.help-block')[1]).html() === 'too short');
    formView.populate({
      a: 'a',
      b: 'ab'
    });
    ok(!formView.serialize());
    formView.populate({
      b: 'abc'
    });
    ok(formView.serialize());
    ok($(formView.$('.help-block')[0]).html() === '');
    ok($(formView.$('.help-block')[1]).html() === '');
    //ensure the form can re-error
    formView.populate({
      a: '',
      b: ''
    });
    ok(!formView.serialize());
    console.log(formView.html());
    ok($(formView.$('.help-block')[0]).html() !== '');
    ok($(formView.$('.help-block')[1]).html() === 'too short');
  });
});
