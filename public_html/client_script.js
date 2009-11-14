var currently_editing = null;

$(document).ready(function() {
  // add onchange handler to checkboxes
  $('input[type="checkbox"]').each(function() {
    $(this).change(toggleScript);
  });

  // add click handler to expand script options
  $('form[name]').each(function() {
    $(this).click(toggleOptions);
  });

  // add handler to directory items
  $('button[class="folder"]').each(function() {
    $(this).click(changeDirectory);
  });

  // add click handler to edit icons
  $('button[class="edit"]').each(function() {
    $(this).click(openSettings);
  });

  // add click handler to delete button
  $('button[class="delete"]').each(function() {
    $(this).click(deleteScript);
  });

  // add click handler to toggle button
  $('button[class="toggle"]').each(function() {
    $(this).click(toggleScript);
  });

  $('#close_notifier').click(remindMeLater);

  // add handler for quick search
  $('input[id="quickfind"]').bind('focus input', function(e) {
      if (e.type == 'focus')
      {
        if (this.value == 'Quick find') this.value = '';
      }
      else
      {
        filterScripts(this.value);
      }
  });
});

function remindMeLater()
{
  var close_button = this;

  $.post('', { action: 'remindmelater' },
    function(data)
    {
      // hide notifier
      $(close_button).parent().slideUp('normal');
    });
}

function openSettings(ev)
{
  var script_form = ev.target.form;

  $.post('', { action: 'getsettings', filename: script_form.name },
    function(data)
    {
      if (data)
        return openScriptSettings(script_form.name, data);
      alert("Can't find any settings for this script!");
    }, 'json');
}

function openScriptSettings(filename, options)
{
  currently_editing = filename;

  var optionsEl = document.createDocumentFragment();

  $(options).each(function(i) {
    optionsEl.appendChild( buildOption(this, i) );
  });

  $('#settings').empty();
  $('#settings').append(optionsEl);

  $('#settings_title').text(filename);
  $('#scripts_list, #quickfind_container').animate( {left: '-100%'} );
  $('#settings_container').animate( {left: '0px'} );
}

function closeScriptSettings()
{
  currently_editing = null;

  $('#settings_container').animate( {left: '100%'} );
  $('#scripts_list, #quickfind_container').animate( {left: '0'} );
}

function buildOption(op, index)
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
      el.addEventListener('change', changeSetting, false);
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
      el.type = 'text';
      el.onclick = editSetting;
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
    indent_lev = indent_lev[0].length;
    op.name = op.name.replace(/^_+/,'');
    ul.className = 'indent'+indent_lev;
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

function editSetting(ev)
{
  $('#settings_container').animate( {left: '-100%'} );
  // don't know how to set property (not attribute) for element in jquery
  var edit_field = $('#edit_field').get(0);
  edit_field.value = ev.target.value; edit_field.related = ev.target;
  $('#edit_dialog').animate( { left: '0px' } );
}

function closeEditDialog()
{
  $('#settings_container').animate( {left: '0'} );
  $('#edit_field').attr( { value: '' } );
  $('#edit_dialog').animate( { left: '100%' } );
}

function saveEditedSetting(form)
{
  form.edit_field.disabled = true;
  form.edit_field.value =
    form.edit_field.value.replace(/[\r\n]+/g, '');

  $.post('', { action: 'changesetting', filename: currently_editing, exactmatch: form.edit_field.related.exactmatch, name: form.edit_field.related.name, value: form.edit_field.value },
    function(data)
    {
      if (data)
      {
        closeEditDialog();
        form.edit_field.related.exactmatch = data.exactmatch;
        form.edit_field.related.value =
          form.edit_field.related.textContent =
          data.value;
      }
      form.edit_field.disabled = false;
    }, 'json');
}

function toggleOptions(ev)
{
  var
    target = ev.target,
    thiselem = this.selectSingleNode('descendant-or-self::div[@class="desc"]');

  // only proceed when clicked on form or script name (UGLY HACK)
  if ( !(target.className == 'name' || target.nodeName == 'FORM') )
  {
    return;
  }

  // roll up all open options
  $('div.desc').each(function() {
    var _this = this;
    // skip clicked element (we want to be able to close expanded options)
    if (thiselem == _this) return;
    $(_this).slideUp('normal');
  });

  // toggle clicked option
  $(thiselem).slideToggle('normal');

  ev.preventDefault();
}

function deleteScript(ev)
{
  var script_form = this.form;

  if ( script_form.name && confirm('Do you really want to delete script:\n' +
               decodeURIComponent(script_form.name) + '?') )
  {
    $.post('', { action: 'delete', filename: script_form.name },
      function(data)
      {
        if (!data.error)
        {
          script_form.parentNode.parentNode.removeChild(
            script_form.parentNode);
        }
        else
        {
          alert(data.error);
        }
      }, 'json');
  }
}

function toggleScript(ev)
{
  var script_form = ev.target.form;

  script_form.check.disabled = true;

  $.post('', { action: 'toggle', filename: script_form.name, enable: script_form.check.checked },
    function(data)
    {
      if (!data.error)
      {
        script_form.name = data.result;
      }
      else
      {
        // revert previous checkbox state
        //script_form.check.checked = !script_form.check.checked;
        alert(data.error);
      }

      $('button.toggle img', script_form).attr( 'class', ( data.enabled ? 'disabled' : '' ) );
      $(script_form.check).attr ( {checked: data.enabled, disabled: false } );
    }, 'json');
}

function changeDirectory(ev)
{
  location.href = location.pathname + '?dir=' + ev.target.form.name;
}

function changeSetting(ev)
{
  if ( !currently_editing )
    return;

  var val = null;

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

function filterScripts(text)
{
  var show_all = false;

  if (text.length < 2) show_all = true;

  text = text.toLowerCase();

  $('#scripts_list span[class="name"]').each(function() {
    if (this.textContent.toLowerCase().indexOf(text) == -1 && !show_all)
      this.selectSingleNode('ancestor-or-self::li').style.display = 'none';
    else
    {
      this.selectSingleNode('ancestor-or-self::li').style.display = 'block';

    }
  });
}
