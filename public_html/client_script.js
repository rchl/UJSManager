var
  currently_editing = null,
  service_page = 'http://unite.opera.com/service/401/';

window.addEventListener(
  'load',
  function()
  {
    Badge.show('Just testing badgie thing');

    // add onchange handler to checkboxes
    var elems = document.selectNodes('//input[@type="checkbox"]');
    for( var i=0,check; check=elems[i]; i++ )
    {
      check.addEventListener('change', toggleScript, false);
    }

    // add handler to directory items
    elems = document.selectNodes('//button[@class="folder"]');
    for( var i=0,check; check=elems[i]; i++ )
    {
      check.addEventListener('click', changeDirectory, false);
    }

    // add click handler to edit icons
    elems = document.selectNodes('//button[@class="edit"]');
    for( var i=0,check; check=elems[i]; i++ )
    {
      check.addEventListener('click', openSettings, false);
    }

    // add handler for quick search
    var qf = document.selectSingleNode('//input[@id="quickfind"]');
    if ( qf )
    {
      qf.addEventListener(
        'focus',
        function() { if (this.value == 'Quick find') this.value = ''; }
        , false
      );
      qf.addEventListener(
        'input',
        function(e) { filterScripts(e.target.value); },
        false
      );
    }

  },
  false
);

function $(id) { return document.getElementById(id); }

var Badge = new function()
{
  var
    _el = null,
    _timeout = null;

  this.show = function(msg, timeout)
    {
      if ( !_el ) init();

      $('badge_msg').textContent = msg;

      _el.style.display = 'block';
      _el.style.marginTop = -_el.scrollHeight+'px';

      _timeout = timeout;
      animateDown();
    };

  this.hide = function()
    {
      animateUp();
    };

  var init = function()
    {
      _el = $('badge');
      $('badge_close').onclick = animateUp;
    };

  var animateDown = function()
    {
      _el.style.marginTop = (parseInt(_el.style.marginTop)+2) + 'px';

      if ( parseInt(_el.style.marginTop) < 0 )
        setTimeout( arguments.callee, 10 );
      else
      {
        _el.style.marginTop = 0;
        if ( _timeout )
        {
          setTimeout( animateUp, _timeout );
          _timeout = false;
        }
      }
    };

  var animateUp = function()
    {
      if ( !_el.cachedHeight)
        _el.cachedHeight = -_el.scrollHeight;

      if ( parseInt(_el.style.marginTop) > _el.cachedHeight )
      {
        _el.style.marginTop = (parseInt(_el.style.marginTop)-4) + 'px';
        _timeout = setTimeout( arguments.callee, 10 );
      }
      else
      {
        _el.style.marginTop = -_el.scrollHeight+'px';
        _el.cachedHeight = null;
      }
    }
}

function openSettings(ev)
{
  var script_form = ev.target.form;

  AjaxRequest.post(
    {
      parameters  :
      {
        action    : 'getsettings',
        filename  : script_form.name,
      },
      onSuccess   : function(req)
                    {
                      try
                      {
                        var result = eval('('+req.responseText+')');
                        if ( result instanceof Object)
                        {
                          return openScriptSettings(script_form.name, result);
                        }
                        alert("Can't find any settings for this script!");
                      }
                      catch(e){}
                    }
    }
  );
}

function openScriptSettings(filename, options)
{
  var settings_el = $('settings');
  while (settings_el.firstChild)
  {
    settings_el.removeChild(settings_el.firstChild);
  }

  currently_editing = filename;

  for( var i=0,op; op=options[i]; i++ )
  {
    settings_el.appendChild( buildOption(op, i) );
  }

  $('settings_title').textContent = $('settings_title').title = filename;
  $('scripts_list').style.visibility = 'hidden';
  $('quickfind_container').style.visibility = 'hidden';
  $('settings_container').style.display = 'block';
}

function closeScriptSettings()
{
  currently_editing = null;
  $('settings_container').style.display = 'none';
  $('scripts_list').style.visibility = 'visible';
  $('quickfind_container').style.visibility = 'visible';
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
  var edit = $('edit_field');

  edit.value = ev.target.value;
  edit.related = ev.target;

  $('edit_dialog').style.display = 'block'
}

function saveEditedSetting(form)
{
  form.edit_field.disabled = true;
  form.edit_field.value =
    form.edit_field.value.replace(/[\r\n]+/g, '');

  AjaxRequest.post(
    {
      parameters  :
      {
        action    : 'changesetting',
        filename  : currently_editing,
        exactmatch: form.edit_field.related.exactmatch,
        name      : form.edit_field.related.name,
        value     : form.edit_field.value
      },
      onSuccess   : function(req)
                    {
                      try
                      {
                        var result = eval('('+req.responseText+')');
                        if ( result )
                        {
                          closeEditDialog();
                          form.edit_field.related.exactmatch = result.exactmatch;
                          form.edit_field.related.value =
                            form.edit_field.related.textContent =
                            result.value;
                        }
                      }
                      catch(e){}
                      form.edit_field.disabled = false;
                    }
    }
  );
}

function closeEditDialog()
{
  $('edit_field').value = '';
  $('edit_dialog').style.display = 'none';
}

function toggleScript(ev)
{
  var script_form = ev.target.form;

  ev.target.disabled = true;

  AjaxRequest.post(
    {
      parameters  :
      {
        action    : 'toggle',
        filename  : script_form.name,
        enable    : ev.target.checked
      },
      onSuccess   : function(req)
                    {
                      var obj = parse_response(req.responseText);
                      if ( !obj.error )
                      {
                        script_form.name = obj.result;
                        //ev.target.nextSibling.data = " "+result.result;
                      }
                      else
                      {
                        // revert previous checkbox state
                        ev.target.checked = !ev.target.checked;
                        alert(obj.error);
                      }

                      ev.target.disabled = false;
                    }
    }
  );
}

function changeDirectory(ev)
{
  var form = ev.target.form;

  location.href = location.pathname + '?dir=' + form.name;
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

  AjaxRequest.post(
    {
      parameters  :
      {
        action    : 'changesetting',
        filename  : currently_editing,
        exactmatch: ev.target.exactmatch,
        name      : ev.target.name,
        value     : val
      },
      onSuccess   : function(req)
                    {
                      try
                      {
                        var result = eval('('+req.responseText+')');

                        var inp = ev.target;

                        // if success - update input values
                        if ( result && inp.name == result.name )
                        {
                          inp.exactmatch = result.exactmatch;
                          switch(inp)
                          {
                            case 'checkbox':
                              inp.checked = ( result.value == true ? true : false );
                              break;
                            case 'text':
                            case 'number':
                              inp.value = result.value;
                              break;
                          }
                        }
                      }
                      catch(e){}
                      ev.target.disabled = false;
                    }
    }
  );
}

function filterScripts(text)
{
  var show_all = false;

  if (text.length == 0) show_all = true;
  else if (text.length < 2) return;

  text = text.toLowerCase();

  var nodes = document.selectNodes('//ul/li/form/label/span/child::text()');
  for (var i = 0, node; node=nodes[i]; i++) {
    if (node.textContent.toLowerCase().indexOf(text) == -1)
      node.parentNode.parentNode.parentNode.style.display = 'none';
    else
      node.parentNode.parentNode.parentNode.style.display = 'block';
  }
}

function parse_response(resp) {
  try {
    return eval('(' + resp + ')');
  } catch(e) {}
  return false;
}