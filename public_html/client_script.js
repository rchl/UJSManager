$(document).ready(function() {
  // handler for enabling/disabling script
  $('button[name="check"], button.toggle').click(ScriptsList.toggleScript);

  // handler for toggling script info
  $('form[name]').click(ScriptsList.toggleItem);

  // handler for directory changing
  $('button.folder').click(ScriptsList.changeDirectory);

  // handler for edit setting buttons
  $('button.edit').click(ScriptsList.loadSettings);

  // handler for delete button
  $('button.delete').click(ScriptsList.deleteScript);

  // handler for "edit script text" button
  $('button.edittxt').click(ScriptsList.editScriptText);

  // handler for canceling edit dialog
  $('#close_edit').click(EditDialog.close);

  // handler for closing settings dialog
  $('#close_settings').click(ScriptSettings.close);

  // handler for hiding update notifier
  $('#close_notifier').click(function() {
    var _this = this;

    $.post('', { action: 'remindmelater' },
      function()
      {
        // hide notifier
        $(_this).parent().slideUp('normal');
      });
  });

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
    var clicked = ev.target;

    // only proceed when clicked on form or script name
    if ( !(clicked.className == 'name' || clicked.nodeName == 'FORM') )
      return;

    var item = $('div.desc', this).get(0);

    // roll up previously open element
    if (last_item && item != last_item)
      $(last_item).slideUp('normal');

    last_item = item;

    // toggle clicked option
    $(item).slideToggle('normal');
  }

  this.toggleScript = function(ev)
  {
    var form = ev.target.form;

    $('button.toggle img', form).attr( { class: 'disabled' } );

    $.post('', { action: 'toggle', filename: form.name, enable: form.check.checked },
      function(data)
      {
        if (!data.error)
          form.name = data.result;
        else
          alert(data.error);

        $('button.toggle img', form).attr( { class: ( data.enabled ? 'disabled' : '' ), disabled: false } );
      }, 'json');
  }

  this.deleteScript = function(ev)
  {
    var form = this.form;

    if ( form.name && confirm('Do you really want to delete script:\n' +
                 decodeURIComponent(form.name) + '?') )
    {
      $.post('', { action: 'delete', filename: form.name },
        function(data)
        {
          if (!data.error)
          {
            form.parentNode.parentNode.removeChild(
              form.parentNode);
          }
          else
          {
            alert(data.error);
          }
        }, 'json');
    }
  }

  this.loadSettings = function(ev)
  {
    var form = ev.target.form;

    $.post('', { action: 'getsettings', filename: form.name },
      function(data)
      {
        if (data)
          return ScriptSettings.open(form.name, data);
        alert("Can't find any settings for this script!");
      }, 'json');
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

    $.post('', { action: 'readtxt', filename: form.name },
      function(data)
      {
        if (!data.error)
        {
          $('#edit_msg').html('Experimental! Please backup before saving.<br><a href="#edittxt='+form.name+'" target="_blank">open in new tab</a>');
          EditDialog.open(form, data, { open: ScriptsList.hide, close: ScriptsList.show });
        }
        else
        {
          alert(data.error);
        }
      }, 'json');
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
        li.appendChild(el);
        ul.appendChild(li);
        break;
      case 'int':
        el = document.createElement('button');
        el.className = 'setting_elem';
        el.type = 'number';
        el.value = op.value;
        el.textContent = op.value;
        break;
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

    li = document.createElement('li');
    var label = document.createElement('label');
    label.textContent = op.name;
    label.title = op.name;
    label.setAttribute('for', 'el'+index);
    li.appendChild(label);
    ul.appendChild(li);

    if ( ul.childNodes.length<2 )
    {
      li.appendChild(el);
      ul.appendChild(li);
    }

    return cont.appendChild(ul);
  }

  this.open = function(filename, options)
  {
    currently_editing = filename;

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
    $('#settings_title').attr('title', filename);
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

    $.post('', { action: 'changesetting', filename: currently_editing, exactmatch: ev.target.exactmatch, name: ev.target.name, value: val },
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
      }, 'json');
  }

  this.saveEditedSetting = function(form)
  {
    var _self = this;
    form.edit_field.disabled = true;
    form.edit_field.value =
      form.edit_field.value.replace(/[\r\n]+/g, '');

    $.post('', { action: 'changesetting', filename: currently_editing, exactmatch: _self.related_element.exactmatch, name: _self.related_element.name, value: form.edit_field.value },
      function(data)
      {
        if (data)
        {
          _self.related_element.exactmatch = data.exactmatch;
          _self.related_element.value = _self.related_element.textContent = data.value;
          EditDialog.close();
        }
        form.edit_field.disabled = false;
      }, 'json');
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
      edit_filename.value = element.name;
      filename_el.hide();
      edit_title.text(element.getAttribute('name'));
      new_script = false;

    }
    else
    {
      filename_el.show();
      edit_title.text('New script');
      $('#edit_msg').html('You will have to reload UJS Manager page to see new file after saving (will be fixed).<br><a href="#newscript=1" target="_blank">open in new tab</a>');
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
        '<form method="POST" action="' + location.protocol + '//' + location.hostname + location.pathname + '" enctype="multipart/form-data">'+
          '<textarea name="data">' + edit_field.value + '</textarea>'+
          '<input name="action" value="writetxt">'+
          '<input name="filename" value="' + edit_filename.value + '">'+
          (new_script?'':'<input type="hidden" name="can_overwrite" value="true">')+
        '</form>'
      )[0];
      ifr.onload = function()
      {
        ifr.onload = function()
        {
          var resp = eval('('+ifr.contentDocument.body.textContent+')');
          if (!resp)
            alert('Saving failed due to unknown problem');
          else if (resp.error)
            alert(resp.error);
          ifr.parentNode.removeChild(ifr);
          EditDialog.close();
        }
        ifr.contentDocument.body.appendChild(form);
        form.submit();
      }
      document.documentElement.appendChild(ifr);
    }
  }
}
