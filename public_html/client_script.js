/**
  *
  * UJS Manager Unite Application
  * Rafal Chlodnicki, 2009-2010
  * http://unite.opera.com/application/401/
  *
  */

// this way it's much easier to handle new elements added
// to document dynamically from html code
document.addEventListener('click', function(e)
{
  var
    _this = e.target,
    handler = _this.getAttribute('handler');

  switch (handler)
  {
    case 'changeDirectory':
      ScriptsList.changeDirectory.call(_this, e);
      break;
    case 'toggleItem':
      ScriptsList.toggleItem.call(_this, e);
      break;
    case 'shareScript':
      ScriptsList.shareScript.call(_this, e);
      break;
    case 'loadSettings':
      ScriptsList.loadSettings.call(_this, e);
      break;
    case 'toggleScript':
      ScriptsList.toggleScript.call(_this, e);
      break;
    case 'editScriptText':
      ScriptsList.editScriptText.call(_this, e);
      break;
    case 'deleteScript':
      ScriptsList.deleteScript.call(_this, e);
      break;
    default:
      return true;
  }
  e.preventDefault();
  return false;
}
, false);

$(document).ready(function() {
  // handler for canceling edit dialog
  $('#close_edit').click(EditDialog.close);

  // handler for closing settings dialog
  $('#close_settings').click(ScriptSettings.close);

  // handler for hiding update notifier
  $('#close_notifier').click(Notifier.close);

  // handler for quick find
  $('#quickfind').bind('focus input', function(e) {
      if (e.type == 'focus')
      {
        if (this.value == 'Quick find') { this.value = ''; }
      }
      else
        ScriptsList.filter(this.value);
  });

  $('#create_script').click(ScriptsList.newScript);

  // handler for toggling all scripts
  $('#onoff').bind('click', function(e) {
    if ($(this).hasClass('off'))
      ScriptsList.toggleAll(true);
    else
      ScriptsList.toggleAll(false);
    $(this).toggleClass('off');
  });

  // perform action if specified
  var action = location.hash.match(/^#([^&]+)$/);
  if (action)
  {
    action = RegExp.$1.split('=');
    var key = action[0], val = action[1];
  }
  switch (key)
  {
    case 'edittxt':
      ScriptsList.editScriptText($('form[name="'+val+'"]').get(0));
      location.hash = '';
      break;
    case 'newscript':
      ScriptsList.newScript();
      location.hash = '';
      break;
  }

  ScriptUpdater.init();

  // set up periodical check for changes in directory (every 5 minutes)
  window.interval = setInterval(ScriptsList.checkIfModified, 1000*60*5);
});

var ScriptsList = new function()
{
  var last_item = null;

  this.hide = function() {
    $('#main_container').animate( {left: '-100%'} );
  }

  this.show = function() {
    $('#main_container').animate( {left: '0'} );
  }

  this.toggleItem = function(ev)
  {
    var item = $('div.desc', this.parentNode);
    if (!item.length) return;

    item = item[0];

    // roll up previously open item
    if (last_item && item != last_item)
      $(last_item).slideUp('normal');

    // toggle clicked item
    $(item).slideToggle('normal');
    last_item = item;
  }

  this.toggleScript = function(ev)
  {
    var form = ev.target.form;

    $('button.toggle img', form).attr( { class: 'disabled' } );

    Server.post('toggle',
      { filename: form.name, enable: form.check.checked },
      function(data)
      {
        if (!data.error)
          form.name = data.script.filepath;
        else
          alert(data.error);

        $('button.toggle img', form).attr( { class: ( data.enabled ? 'disabled' : '' ), disabled: false } );
      });
  }

  /**
    * Toggle all script files
    */
  this.toggleAll = function(enable)
  {
    // when disabling enable overlay
    $('#scripts_list_overlay').attr({ class: enable ? 'on' : 'off' });

    Server.post('toggleall',
      { enable: enable },
      function(data)
      {
        if (data.error)
          alert('Following scripts were not ' + (enable ? 'enabled' : 'disabled' ) + ':\n' + data.error + '\nPlease correct problem manually.');

        // when enabling, reload (lazy way)
        if (enable)
          location.reload();
      }
    );
  }

  this.shareScript = function(ev)
  {
    var form = ev.target.form;

    Server.post('toggleshare',
      { filename: form.name },
      function(data)
      {
        if (!data.error)
          form.className = (data.shared ? 'shared' : '');
        else
          alert(data.error);
      });
  }

  this.deleteScript = function(ev)
  {
    var form = this.form;

    if ( form.name && confirm('Do you really want to delete script:\n' +
                 unescape(form.name) + '?') )
    {
      Server.post('delete',
        { filename: form.name },
        function(data)
        {
          if (!data.error)
          {
            $(form).parents('li').hide('normal', function(){ $(this).remove(); })
          }
          else
          {
            alert(data.error);
          }
        });
    }
  }

  this.loadSettings = function(ev)
  {
    var form = ev.target.form;

    Server.post('getsettings',
      { filename: form.name },
      function(data)
      {
        if (data)
          return ScriptSettings.open(form.name, data);
        alert("Can't find any settings for this script!");
      });
  }

  this.changeDirectory = function(ev)
  {
    location.href = location.pathname + '?dir=' + ev.target.form.name;
  }

  this.filter = function(text)
  {
    var show_all = (text.length < 2 ? true : false);
    var regexp = new RegExp(text, "i");

    $('#scripts_list li').each(function() {
      if (regexp.test($('span.name', this).text()) || show_all)
        this.style.display = 'block';
      else
      {
        this.style.display = 'none';
      }
    });

  }

  this.newScript = function()
  {
    EditDialog.open(null, '', {
      open: ScriptsList.hide,
      close: ScriptsList.show
    });
  }

  this.editScriptText = function(ev)
  {
    if (!ev) return;

    var form;
    if (ev instanceof HTMLElement)
      form = ev;
    else
      form = ev.target.form;

    Server.post('readtxt',
      { filename: form.name },
      function(data)
      {
        if (!data.error)
        {
          $('#edit_msg').html('<a href="#edittxt='+form.name+'" target="_blank">open in new tab</a>');
          EditDialog.open(form, data, { open: ScriptsList.hide, close: ScriptsList.show });
        }
        else
          alert(data.error);
      });
  }

  this.checkIfModified = function()
  {
    Server.post('haschanged',
      {},
      function(data)
      {
        if (data && data.modified)
        {
          $('#changes').slideDown('normal');
          clearInterval(window.interval);
        }
      });
  }
}

var ScriptSettings = new function()
{
  var currently_editing = null;
  var settings_el = null;

  this.init = function(op, index)
  {
    var
      cont = document.createElement('div'),
      ul = document.createElement('ul'),
      li = document.createElement('li'),
      el;

    switch (op.type)
    {
      case 'bool':
        el = document.createElement('input');
        el.type = 'checkbox';
        el.id = 'el'+index;
        el.checked = ( op.value=='true' ? true : false );
        el.addEventListener('change', ScriptSettings.changeSetting, false);
        // argh, hack for bool - append before text
        break;
      case 'int':
      case 'string':
      case 'regexp':
        el = document.createElement('span');
        el.className = 'setting_elem';
        el.onclick = function(){
          EditDialog.open(
            this,
            this.value,
            { open: function() { $('#settings_dialog').animate( {left: '-100%'} ); },
              close: ScriptSettings.show,
              save: ScriptSettings.saveEditedSetting }
          );
        }
        el.type = 'text';
        el.value = el.title = op.value;
        el.textContent = op.value;
        break;
    }

    el.setAttribute('name', op.name);
    el.exactmatch = op.exactmatch;

    // use leading underscores as indent level
    var indent_lev = op.name.match(/^_+/);
    if ( indent_lev )
    {
      op.name = op.name.replace(/^_+/,'');
      ul.className = 'indent'+indent_lev[0].length;
    }

    var label = document.createElement('label');
    label.appendChild(el);
    label.appendChild( document.createTextNode(' ' + op.name) );
    label.title = op.name;
    li.appendChild(label);
    ul.appendChild(li);

    return cont.appendChild(ul);
  }

  this.open = function(filename, options)
  {
    currently_editing = filename;
    filename = filename.replace(/^.+\//, '');

    if (!settings_el)
    {
      settings_el = $('#settings');
    }

    var optionsEl = document.createDocumentFragment();

    $(options).each(function(i) {
      optionsEl.appendChild( ScriptSettings.init(this, i) );
    });

    settings_el.empty();
    settings_el.append(optionsEl);
    $('#settings_container').height( $('#settings_dialog').height() - $('#settings_header').outerHeight() );
    $('#settings_title').text(filename);
    $('#settings_title').attr('title', unescape(filename));
    ScriptsList.hide();
    ScriptSettings.show();
  }

  this.close = function()
  {
    currently_editing = null;

    ScriptSettings.hide();
    ScriptsList.show();
  }

  this.show = function()
  {
    $('#settings_dialog').animate( {left: '0px'} );
  }

  this.hide = function()
  {
    $('#settings_dialog').animate( {left: '100%'} );
  }

  this.changeSetting = function(ev)
  {
    if ( !currently_editing )
      return;

    var val;

    switch(ev.target.type)
    {
      case 'checkbox':
        val = ev.target.checked;
        break;
      case 'text':
      case 'number':
        val = ev.target.value;
        break;
    }
    if ( val === null ) return false;

    ev.target.disabled = true;

    Server.post('changesetting',
      { filename: currently_editing, exactmatch: ev.target.exactmatch, name: ev.target.name, value: val },
      function(data)
      {
        var inp = ev.target;

        // if success - update input values
        if ( data && inp.name == data.name )
        {
          inp.exactmatch = data.exactmatch;
          switch(inp)
          {
            case 'checkbox':
              inp.checked = ( data.value == true ? true : false );
              break;
            case 'text':
            case 'number':
              inp.value = data.value;
              break;
          }
        }

        ev.target.disabled = false;
      });
  }

  this.saveEditedSetting = function(form)
  {
    var _self = this;
    form.edit_field.disabled = true;
    form.edit_field.value =
      form.edit_field.value.replace(/[\r\n]+/g, '');

    Server.post('changesetting',
      { filename: currently_editing, exactmatch: _self.related_element.exactmatch, name: _self.related_element.name, value: form.edit_field.value },
      function(data)
      {
        if (data)
        {
          _self.related_element.exactmatch = data.exactmatch;
          _self.related_element.value = _self.related_element.textContent = data.value;
          EditDialog.close();
        }
        form.edit_field.disabled = false;
      });
  }
}

var EditDialog = new function()
{
  var _self = this;
  var edit_dialog;
  var filename_el;
  var new_script = true;
  var edit_form;
  var edit_filename;
  var edit_field;
  var save_callback;
  var close_callback;
  this.related_element = null;

  this.show = function()
  {
    edit_dialog.animate( { left: '0px' } );
  }

  this.hide = function(callback)
  {
    if (callback)
      edit_dialog.animate( { left: '100%' } );
    else
      edit_dialog.animate( { left: '100%' }, 'normal', 'swing', callback);
  }

  this.open = function(element, data, callback_obj)
  {
    if (!edit_form)
    {
      edit_dialog = $('#edit_dialog');
      edit_form = $('#edit_form')[0];
      edit_field = edit_form.edit_field;
      edit_filename = edit_form.filename;
      edit_title = $('#edit_title').empty();
      filename_el = $('#edit_filename');
    }

    edit_field.value = data;
    edit_filename.value = '';
    save_callback = callback_obj.save;
    close_callback = callback_obj.close;

    // if element given, edit existing file/setting, otherwise create new file
    if (element)
    {
      _self.related_element = element;
      edit_filename.value = element.getAttribute('name');
      filename_el.hide();
      if (element.prettyname)
        edit_title.text(element.prettyname.value);
      else
        edit_title.text(element.getAttribute('name'));
      new_script = false;
    }
    else
    {
      filename_el.show();
      edit_title.text('New script');
      $('#edit_msg').html('<a href="#newscript=1" target="_blank">open in new tab</a>');
      new_script = true;
    }

    // resize textarea to fit whole available height
    edit_field.style.height = (edit_dialog.height() - ($('#edit_header').outerHeight()+edit_form.offsetHeight-edit_field.offsetHeight)) + 'px';

    edit_field.form.onsubmit = function(e)
    {
      EditDialog.save();
      return false;
    };

    callback_obj.open();
    EditDialog.show()

  }

  this.close = function()
  {
    EditDialog.hide(function() {
      edit_filename.value = '';
      edit_field.value = ''
      $('#edit_msg').empty();
      edit_title.empty();
    });

    if (close_callback)
      close_callback();

    close_callback = null;
    save_callback = null;
    _self.related_element = null;
  }

  this.save = function()
  {
    if ( !(edit_field.value && edit_filename.value) )
      return alert("Can't save empty value");

    if (save_callback)
    {
      save_callback.call(_self, edit_form);
    }
    else
    {
      // add js extension if missing when creating new scripts
      if (new_script)
      {
        if (!(/\.js$/i.test(edit_filename.value)))
          edit_filename.value += '.js';
      }

      // have to post in hidden iframe as XHR can't handle multipart/form-data
      var ifr = $('<iframe style="display:none" src="about:blank"></iframe>')[0];
      var form = $(
        '<form method="POST" action="' + location.protocol + '//' + location.host + location.pathname + '" enctype="multipart/form-data">'+
          '<textarea name="data"></textarea>'+
          '<input name="action" value="writetxt">'+
          '<input name="filename">'+
          (new_script?'':'<input type="hidden" name="can_overwrite" value="true">')+
        '</form>'
      )[0];
      // encode script text, otherwise it can be trimmed when having some non-ascii characters
      form.data.value = escape(edit_field.value);
      form.filename.value = edit_filename.value;
      ifr.onload = function()
      {
        ifr.onload = function()
        {
          var resp = eval('('+ifr.contentDocument.documentElement.textContent+')');
          if (!resp)
            alert('Saving failed due to unknown problem');
          else if (resp.error)
            alert(resp.error);
          else
          {
            if (resp.script)
            {
              var s = $(resp.script);
              s[0].style.opacity = 0;
              $('#scripts_list').append(s);
              s[0].scrollIntoView();
              s.fadeTo(2000, 1);
            }
            EditDialog.close();
          }

          ifr.parentNode.removeChild(ifr);
        }
        ifr.contentDocument.body.appendChild(form);
        form.submit();
      }
      document.documentElement.appendChild(ifr);
    }
  }
}

var Notifier = new function()
{
  this.close = function() {
    var _this = this;

    Server.post('remindmelater',
      {},
      function()
      {
        // hide notifier
        $(_this).parent().slideUp('normal');
      });
  }
}

var ScriptUpdater = new function()
{
  /* Checks if scripts were checked for update in last 3 days
     and performs check if not */
  this.init = function()
  {
    var last_update = getPref('last_scripts_update');
    if (last_update)
    {
      var diff = new Date() - new Date(last_update);
      var days = Math.round(diff/(1000*60*60*24));
      if (days >= 3)
        ScriptUpdater.checkUpdate();
    }
    else
      ScriptUpdater.checkUpdate();
  }

  this.checkUpdate = function()
  {
    setPref('last_scripts_update', new Date().toString());
    Server.post("check_script_updates", {}, process);
  }

  var process = function(data)
  {
    // returns object with key = filepath / value = update url
    for (var n in data)
    {
      var update_button = $('form[name="' + n + '"] a.update');
      if (update_button)
      {
        update_button.attr('href', data[n]).fadeIn('slow');
        $.scrollTo(update_button, 1000);
      }
    }
  }
}

function setPref(key, val)
{
  if (val === undefined) return;

  if (window.localStorage)
    return localStorage[key] = escape(val);
  else
    return widget.setPreferenceForKey(escape(val), key);
}

function getPref(key)
{
  if (window.localStorage)
    return unescape(localStorage[key]||'');
  else
    return unescape(widget.preferenceForKey(key)||'');
}

/**
  * Communication with server side
  */
var Server = new function()
{
  this.post = function(action, args, callback)
  {
    args.action = action;
    $.post('', args, callback, 'json');
  }
}
