/**
  *
  * UJS Manager Unite Application
  * Rafal Chlodnicki, 2009-2010
  * http://unite.opera.com/application/401/
  *
  */

var
  SHARED_DIR = opera.io.filesystem.mountSystemDirectory('shared'),
  APP_DIR = opera.io.filesystem.mountSystemDirectory('application'),
  SERVICE_DOAP = 'http://unite.opera.com/service/doap/401/',
  /* DON'T FORGET TO UPDATE VERSION FOR EVERY RELEASE !!! */
  SERVICE_VERSION = '2.8',
  SERVICE_PATH = 'http://' + opera.io.webserver.hostName + opera.io.webserver.currentServicePath,
  SERVICE_PATH_ADMIN = 'http://admin.' + opera.io.webserver.hostName + opera.io.webserver.currentServicePath,
  DATA;


opera.io.webserver.addEventListener('_request', handleRequest, false);
opera.io.webserver.addEventListener('shared', handleShared, false)

function handleRequest(event)
{
  var response = event.connection.response;
  var request = event.connection.request;
  var isOwner = event.connection.isOwner; // || (request.ip == '127.0.0.1');

  if (PublicFiles.isPublic(request.uri))
  {
    response.closeAndRedispatch();
    return;
  }

  // this block is before isOwner check because we want user to be able to install script from
  // normal pages. We could redirect to admin page but that would cause frightening unite redirect
  // warning page. Instead, we redirect from script file to public service address and then to
  // admin service address without causing warnings. Admin page is where all the magic happens
  // and remote users can't connect to it anyway.
  if (request.bodyItems['install_script'])
  {
    // show error if incorect id given
    if (!request.bodyItems['unique_id']
         || request.bodyItems['unique_id'][0] != getPref('unique_id'))
    {
      response.write("This won't work. Bad unique id.");
      response.close();
      return;
    }

    // pre-installation dialog which shows script info and install button
    if (!request.bodyItems['confirm'])
    {
      var tpldata = {
        admin_url     : SERVICE_PATH_ADMIN,
        install_url   : request.bodyItems['install_script'][0],
        script_body   : document.createTextNode(unescape(request.bodyItems['script_body'][0])),
        unique_id     : request.bodyItems['unique_id'][0],
        ask_overwrite : false,
        old_header    : null,
        new_header    : null
      };

      // extract file name from path
      var filename = tpldata.install_url.match(/.+\/([^/?]+)/);
      if (filename)
      {
        filename = filename[1];
        // check if file already exists and ask for overwrite if yes
        var existing_body = readFile(filename);
        if (existing_body !== null)
        {
          tpldata.ask_overwrite = true;
          tpldata.old_header = Script.parseHeader(existing_body)||{'<missing>':''};
          tpldata.new_header = Script.parseHeader(tpldata.script_body.data)||{'<missing>':''};

        }
      }
      else
      {
        response.write("Error. UJS Manager couldn't extract filename from path.");
        response.close();
        return;
      }

      var template = new Markuper('templates/install.html', tpldata);
      response.write(template.parse().html());
      response.close();
      return;
    }
    else if (isOwner) // handles actual installation of script after confirming
    {
      var
        script_uri = unescape(request.bodyItems['install_script'][0]),
        script_body = request.bodyItems['script_body'][0],
        overwrite = ( request.bodyItems['overwrite'] ? true : false ),
        filename = script_uri.match(/.+\/([^/?]+)/);

      // we are pretty sure that regexp above will match as it did in install dialog already
      filename = filename[1];

      // save download url for future use
      saveScriptDownloadURL(filename, script_uri);

      // install file if there is none already
      widget.showNotification(
        createFile(filename, script_body, overwrite) ?
          ( overwrite ? 'User script "' + filename + '" updated': 'User script "' + filename + '" installed' )
          : 'Error installing "' + filename + '"!'
      );

      // redirect to admin part
      response.setStatusCode('303');
      response.setResponseHeader('Location', SERVICE_PATH_ADMIN);
      response.close();
      return;
    }
  }

  // serve shared file (path is escaped to handle ampersands among the others)
  // this is left for compatibility reasons, new way of sharing uses pretty URIs
  var File;
  if (request.queryItems['getshared']
      && (File = ScriptsDirectory.isShared(unescape(request.queryItems['getshared'][0]))))
  {
    response.setResponseHeader('Content-Type', 'text/javascript; charset=utf-8');
    response.write(File.filecontent||'not available');
    response.close();
    return;
  }

  // show public page
  if (!isOwner)
  {
    var tpldata = {
      msg       : $('<p>If you are the owner of this service, you can go to <a href="' + SERVICE_PATH_ADMIN + '" onclick="location.replace(this.href);return false;">Admin section</a></p>'),
      footer    : $('<p id="footer">Generated by <a href="http://unite.opera.com/application/401/">UJS Manager Opera Unite application</a></p>'),
      scripts   : ScriptsDirectory.getScriptsMatchingFilter('SHARED'),
      username  : opera.io.webserver.userName||'user'
    };

    // update global array of shared script
    var new_shared = [];
    for (var i=0; i<tpldata.scripts.length; i++)
    {
      new_shared.push(tpldata.scripts[i].printpath);
    }
    shared_scripts = new_shared;

    var template = new Markuper('templates/remote.html', tpldata);
    response.write(template.parse().html());
    response.close();
    return;
  }

  // handle xhr calls with json
  if (request.bodyItems['action'])
  {
    var resp = handleXHRRequest(request.bodyItems);
    response.setResponseHeader('Content-type', 'text/plain; charset=utf-8');
    response.write(JSON.stringify(resp));
    response.close();
    return;
  }

  // set sorting pref
  if (request.queryItems['sorting'])
  {
    setPref('sorting', request.queryItems['sorting'][0]);
  }
  // set display pref
  if (request.queryItems['display'])
  {
    setPref('display', request.queryItems['display'][0]);
  }
  if (request.queryItems['alt_icon'])
  {
    setPref('alt_icon', getPref('alt_icon') ? '' : '_red');
    response.setStatusCode('303');
    response.setResponseHeader('Location', SERVICE_PATH_ADMIN);
    response.close();
  }

  var dir_query = null;

  if (request.queryItems['dir'])
  {
    dir_query = request.queryItems['dir'][0];
  }

  DATA = {
    scripts     : ScriptsDirectory.getAllUserScripts(dir_query),
    onoff       : getPref('disabled_scripts') ? 'off' : 'on',
    sorting     : getPref('sorting')||'name',
    display     : getPref('display')||'name',
    alt_icon    : getPref('alt_icon')||'',
    version     : SERVICE_VERSION,
    newversion  : Updater.checkUpdate(),
    service_path: SERVICE_PATH,
    readonly    : !ScriptsDirectory.isWritable()
  }

  var template = new Markuper('templates/tpl.html', DATA);

  response.write(template.parse().html());
  response.close();
}

function handleShared(event)
{
  var response = event.connection.response;
  var request = event.connection.request;

  var filepath = request.uri.match(/\/shared(\/.+)/);
  if (filepath)
    filepath = filepath[1];

  // serve shared file (path is escaped to handle ampersands among the others)
  var File, content;
  if (filepath && (File = ScriptsDirectory.isShared(unescape(filepath))))
  {
    content = File.filecontent;
    response.setResponseHeader('Content-Type', 'text/javascript; charset=utf-8');
  }
  response.write(content||'not available');
  response.close();
}

function handleXHRRequest(query)
{
  var
    action = query['action'][0],
    q_filename = query['filename'] ? query['filename'][0] : null;

  switch (action)
  {
    case 'toggle':
      return ScriptsDirectory.toggle(q_filename);
    case 'toggleall':
      return ScriptsDirectory.toggleAll(query['enable'][0] == 'true');;
    case 'toggleshare':
      return ScriptsDirectory.shareScript(q_filename);
    case 'getsettings':
      return Script.getSettings(q_filename);
    case 'changesetting':
    {
      var q_exactmatch = query['exactmatch'][0];
      var q_name = query['name'][0];
      var q_value = query['value'][0];
      return Script.changeSetting(q_filename, q_exactmatch, q_name, q_value);
    }
    case 'delete':
      return ScriptsDirectory.deleteScript(q_filename)||{error: 'Deleting file failed!'};
    case 'readtxt':
      return readFile(q_filename)||{error: "Wasn't able to read file or file empty!"}
    case 'writetxt':
    {
      var File = null;
      if (File=writeFile(q_filename, unescape(query['data'][0]), query['can_overwrite']))
      {
        if (query['can_overwrite'])
        {
          // modified existing file
          return ScriptsDirectory.getUserScript(File);
        }
        else
        {
          // created new file
          ScriptsDirectory.hasChanged();
          var new_script = ScriptsDirectory.getUserScript(File);
          DATA.scripts.push(new_script);
          var template = new Markuper( 'templates/tpl.html', { scripts: [new_script], service_path: SERVICE_PATH } );
          return { script: template.parse().select('#scripts_list')[0].innerHTML };
        }
      }
      else
        return { error: "Wasn't able to write file. Possibly file with that name already exists!" };
    }
    case 'haschanged':
      return { modified: ScriptsDirectory.hasChanged() };
    case 'remindmelater':
      Updater.remindMeLater();
      return true;
    default:
      return {error: 'Option not implemented!'};
  }
  return false;
}

/**
  * Script object
  */
var Script = new function()
{
  /**
    * creates key-value object from user script header
    * @return array of objects with key-value pairs
    */
  this.parseHeader = function(content)
  {
    var
      start = content.indexOf('// ==UserScript=='),
      end,
      desc;

    // Only accept headers at the beginning of the file but also
    // accept one preceeding characters for UTF8 BOM (Opera bug - should not be exposed)
    if (start == 0 || start == 1)
    {
      end = content.indexOf('// ==/UserScript==');
      if (end != -1)
      {
        // add length of header start string
        start += 18
        desc = content.substr(start, end-start);
        // remove trailing/ending spaces
        desc = desc.replace(/(^\s+|\s+$)/, '');
        // remove some stuph
        desc = desc.replace(/^\/\/\s+/gm, '');
      }
    }

    if (!desc)
      return null;

    var
      lines = desc.split('\n'),
      line,
      rgx_match = null,
      line_rgx = /^@(.+?)\s+(.+)/,
      data = [];

    for (var i=0; i<lines.length; i++)
    {
      line = lines[i];
      // skip empty lines
      if (!line) continue;

      rgx_match = line.match(line_rgx);
      if (rgx_match && rgx_match.length > 1)
      {
        var name = rgx_match[1], val = rgx_match[2];
        data.push({ key: name, value: trim(val) });
      }
    }
    return (data?data:null);
  }

  /**
    * gathers all settings from user script by looking for matching patters
    * @return array of objects with specific keys
    */
  this.getSettings = function(filename)
  {
    var content = readFile(filename);
    if ( !content ) return false;

    // matches all options of kind /*@opname@optype@*/opvalue/*@*/
    var matches = content.match(/\/\*@[^@]+@(bool|int|string|regexp)@\*\/.*\/\*@\*\//g);
    if ( !matches ) return false;

    // matches individual types of given option
    var
      ret = [],
      optionmatch = /^\/\*@([^@]+)@([^@]+)@\*\/(.*)\/\*@\*\/$/;


    /*
     * option object:
     *  name,
     *  type,
     *  value,
     *  exactmatch
     */
    for ( var i=0; i<matches.length; i++ )
    {
      var match = matches[i].match(optionmatch);
      ret.push({
        name        : match[1],
        type        : match[2],
        value       : match[3],
        exactmatch  : matches[i]
      });
    }
    return ret;
  }

  this.changeSetting = function(filename, exactmatch, name, value)
  {
    var content = readFile(filename);

    var newval = exactmatch.replace(/\*\/.*\/\*@\*\/$/, '*/'+value+'/*@*/');

    content = content.replace(exactmatch, newval);

    if ( writeFile(filename, content, true) )
    {
      return {
        filename  : filename,
        name      : name,
        value     : value,
        exactmatch: newval
      };
    }
    return {};
  }
}

/**
  * Scripts Directory object
  */
var ScriptsDirectory = new function()
{
  // used to check for modifications made in directory
  var files_arr = [];
  // array of filenames that we share
  var shared_scripts = ( getPref('shared_scripts') ? getPref('shared_scripts').split('|') : [] );
  // array of filepaths that are disabled
  var disabled_scripts = ( getPref('disabled_scripts') ? JSON.parse(getPref('disabled_scripts')) : [] );

  /**
    * Reads all user scripts in directory
    * @returns array of script objects
    */
  this.getAllUserScripts = function(requested_dir)
  {
    if ( requested_dir && SHARED_DIR.resolve(requested_dir).exists )
      SHARED_DIR = SHARED_DIR.resolve(requested_dir);
    else
      SHARED_DIR = opera.io.filesystem.mountSystemDirectory('shared');

    var istopdir = /\/shared$/i.test(SHARED_DIR.path);
    SHARED_DIR.refresh();

    var
      scripts = [],
      ujs_installer = false,
      sorting = getPref('sorting')||'name';

    // add link to parent directory
    if ( SHARED_DIR.parent.exists )
    {
      scripts.push
      ({
        prettyname  : '..',
        filename    : SHARED_DIR.parent.path.replace('mountpoint:/', ''),
        filepath    : SHARED_DIR.parent.path.replace('mountpoint:/', ''),
        isdirectory : true
      });
    }

    var
      obj = null
      ,jsext = /\.js(\.xx|)$/i;
    files_arr = [];

    for ( var i = 0, File; File = SHARED_DIR[i]; i++ )
    {
      // special handling for directories
      if ( File.isDirectory )
      {
        scripts.push
        ({
          prettyname  : unescape(File.name),
          filename    : File.path.replace('mountpoint:/', ''),
          filepath    : File.path.replace('mountpoint:/', ''),
          isdirectory : true
        });

        continue;
      }

      // skip if no js extension (or disabled - .xx)
      if ( !(jsext.test(File.name)) ) continue;

      files_arr.push(File.path);

      obj = ScriptsDirectory.getUserScript(File);
      scripts.push( obj );

      // look for user js installer
      if ( "ujs_manager_installer.js" == obj.printname )
        ujs_installer = obj;
    }

    // only top directory should get ujs installer script
    if (istopdir)
    {
      // copy user js installer if not found or older
      var scr_installer = ScriptsDirectory.getUserScript(APP_DIR.resolve('/js/ujs_manager_installer.js'));

      if (!ujs_installer
          || getPropOfArrayItem('version', scr_installer.header) > getPropOfArrayItem('version', ujs_installer.header)
          || getPropOfArrayItem('servicepath', ujs_installer.header) != SERVICE_PATH
          || getPropOfArrayItem('uniqueid', ujs_installer.header) != getPref('unique_id'))
      {
        // insert current service path to ujs installer
        scr_installer.filecontent = scr_installer.filecontent.replace(
                                      /\{\{service_path\}\}/g, SERVICE_PATH);

        // generate unique id (for script installation)
        var unique_id = Math.random();
        scr_installer.filecontent = scr_installer.filecontent.replace(
                                      /\{\{unique_id\}\}/g, unique_id);
        setPref('unique_id', unique_id);

        // if script exists, it might have been disabled so we have to use filename with .xx
        var filename = ujs_installer ? ujs_installer.filename : 'ujs_manager_installer.js';

        var File = writeFile(filename, scr_installer.filecontent, true);

        // add user js installer to list because it wasn't there when reading dir
        if (!ujs_installer && File)
          scripts.push(ScriptsDirectory.getUserScript(File));
      }
    }

    var sort_method = (function()
    {
      switch(sorting)
      {
        case 'status':
          return function(a,b) {
            if (a.isenabled != b.isenabled)
              return (a.isenabled?-1:1);
            return (a.prettyname.toLowerCase() < b.prettyname.toLowerCase()?-1:1);
          };
        case 'name':
        default:
          return function(a,b) {
            return (a.prettyname.toLowerCase() < b.prettyname.toLowerCase()?-1:1);
          };
      }
    })();

    // sort scripts by choosen order
    scripts.sort(
      function(a, b)
      {
        // put directories on top
        if ( a.isdirectory != b.isdirectory )
          return (a.isdirectory?-1:1);
        return sort_method(a, b);
      }
    );

    return scripts;
  }

  /**
    * Creates object from user script file
    * @returns script object
    */
  this.getUserScript = function(File, skip_content)
  {
    var
      path = File.path.replace('mountpoint:/', '')
      ,printpath = path.replace(/\.xx$/i, '');

    var obj = {
        prettyname  : unescape(File.name.replace(/\.xx$/i, '')),
        printname   : unescape(File.name.replace(/\.xx$/i, '')),
        filename    : File.name,
        filepath    : path,
        printpath   : printpath,
        encpath     : escape(printpath),
        isenabled   : ( ( /\.js$/i.test(File.name) ) ? true : false ),
        isdirectory : false,
        isshared    : ( shared_scripts.include(printpath) ? 'shared' : false ),
        hassettings : false,
        filecontent : skip_content ? null : readFile(File.path),
        header      : null
      };

    if (obj.filecontent)
    {
      // if at last one setting found in file then add edit button
      if (obj.filecontent.match(/\/\*@[^@]+@(bool|int|string)@\*\/.+\/\*@\*\//g))
        obj.hassettings = true;

      // read script header
      obj.header = Script.parseHeader(obj.filecontent);
      if (obj.header)
      {
        if (getPref('display') != 'filename')
        {
          // try to get pretty name
          obj.prettyname = getPropOfArrayItem('name', obj.header)||obj.prettyname;
        }
      }
    }
    return obj;
  }

  /**
    * Returns scripts that match requested filter
    * @returns array of script objects consisting of filtered scripts
    */
  this.getScriptsMatchingFilter = function(SCRIPTS_FILTER)
  {
    var scripts = [], filter_function;

    switch(SCRIPTS_FILTER)
    {
      case 'SHARED':
        filter_function = function(s) {
          return !s.isdirectory && shared_scripts.include(s.printpath);
        }
        break;
      case 'ALL':
        filter_function = function(s) { return true; }
        break;
      case 'ENABLED':
        filter_function = function(s) { return s.isenabled; }
        break;
      case 'DISABLED':
        filter_function = function(s) { return !s.isenabled; }
        break;
      default:
        return scripts;
    }

    for (var i=0; i<DATA.scripts.length; i++)
    {
      if (filter_function(DATA.scripts[i]))
      {
        scripts.push(DATA.scripts[i]);
      }
    }

    return scripts;
  }

  this.isShared = function(path)
  {
    if (!path || !shared_scripts.include(path))
      return false;

    for (var i=0; i<DATA.scripts.length; i++)
    {
      if (DATA.scripts[i].printpath == path)
        return DATA.scripts[i];
    }

    return false;
  }

  this.shareScript = function(filename)
  {
    if (!filename) return { error: 'No filename specified!' };

    // we share both disabled and enabled scripts using same filename
    filename = filename.replace(/\.xx$/i, '');

    if (/\bujs_manager_installer\.js/i.test(filename))
    {
      return { error: "Sharing of this script is disabled. It contains data specific to this user which shouldn't be shared."};
    }

    var index;
    // if filename already in array then remove and unshare script
    if ((index = shared_scripts.indexOf(filename)) != -1)
      shared_scripts.splice(index, 1);
    else
      shared_scripts.push(filename);

    setPref('shared_scripts', shared_scripts.join('|'));
    return { shared: shared_scripts.include(filename) };
  }

  this.hasChanged = function()
  {
    var is_dirty = false;
    var tmp = [];
    var jsext = /\.js(\.xx|)$/i;

    SHARED_DIR.refresh();

    for (var i=0, f; f=SHARED_DIR[i]; i++)
    {
      if (!(jsext.test(f.path))) continue;
      tmp.push(f.path);
    }

    for (var i=0, f; f=tmp[i]; i++)
    {
      if (f != files_arr[i])
      {
        is_dirty = true;
      }
    }

    files_arr = tmp;
    return is_dirty;
  }

  this.deleteScript = function(filepath)
  {
    if (!filepath) return;

    for (var i=0; i<DATA.scripts.length; i++)
    {
      if (DATA.scripts[i].filepath == filepath)
      {
        DATA.scripts.splice(i, 1);
        return deleteFile(filepath);
      }
    }
    return false;
  }

  this.toggle = function(filepath)
  {
    var
      newpath = null,
      enabled = null,
      File = SHARED_DIR.resolve(filepath);

    if ( File && File.exists )
    {
      if ( File.path.match(/\.js\.xx$/i) )
      {
        // enable script
        newpath = File.path.replace(/\.js\.xx$/i, '.js');
        enabled = true;
      }
      else if ( File.path.match(/\.js$/i) )
      {
        // disable script
        newpath = File.path.replace(/\.js$/i, '.js.xx');
        enabled = false;
      }
      else
      {
        // do nothin
        return {error: "Error. Script with file name " + filepath + " is not user script file!"};
      }

      // make sure new path does not overwrite any other file
      if ( newpath && !SHARED_DIR.resolve(newpath).exists )
      {
        File = File.moveTo(newpath);
      }
      else
      {
        return {
          error: "Error. Script with file name " + newpath.replace(/.*\/([^\/]+)$/, '$1') + " already exists!",
          enabled: !enabled
        };
      }

      var s = ScriptsDirectory.getUserScript(File);

      // update script object
      var index = -1;
      for (var i=0; i<DATA.scripts.length; i++)
      {
        if (DATA.scripts[i].filepath == filepath)
          DATA.scripts[i] = s;
      }

      ScriptsDirectory.hasChanged();

      return {
        script: s,
        enabled: enabled
      };
    }
  }

  this.toggleAll = function(enable)
  {
    var err = '';

    if (enable)
    {
      if (!disabled_scripts.length)
        return true;

      for (var i=0; i<DATA.scripts.length; i++)
      {
        var s = DATA.scripts[i];
        if (disabled_scripts.indexOf(s.filepath) != -1)
        {
          var ret;
          if ((ret = ScriptsDirectory.toggle(s.filepath)) && !('error' in ret))
            DATA.scripts[i] = ret.script;
          else
            err += ret.error + '\n';
        }
      }
      disabled_scripts = [];
      setPref('disabled_scripts', '');
    }
    else
    {
      // if there are scripts disabled, don't overwrite
      if (disabled_scripts.length)
        return;

      // disable
      disabled_scripts = [];
      for (var i=0; i<DATA.scripts.length; i++)
      {
        var s = DATA.scripts[i];
        if (s.isdirectory)
          continue;

        if (s.isenabled)
        {
          var ret;
          if ((ret = ScriptsDirectory.toggle(s.filepath)) && !('error' in ret))
          {
            disabled_scripts.push(ret.script.filepath);
            DATA.scripts[i] = ret.script;
          }
          else
            err += ret.error + '\n';
        }
      }

      if (disabled_scripts.length)
        setPref('disabled_scripts', JSON.stringify(disabled_scripts));
    }

    if (err)
      return { error: err };
    else
      return {};
  }

  this.isWritable = function()
  {
    var temp_name = 'isDirectoryWritableTest' + new Date().getTime() + '.tmp';

    if (writeFile(temp_name, 'foo', false))
    {
      deleteFile(temp_name);
      return true;
    }
    return false;
  }
}
DATA = { scripts: ScriptsDirectory.getAllUserScripts() };

/**
  * Update checking
  */
var Updater = new function()
{
  var latest_ver = getPref('latestVer');
  var last_check = getPref('lastCheck');

  this.checkUpdate = function(force)
  {
    // if there is saved pref with higher version then
    // don't check. we know about new version already
    if ( parseFloat(latest_ver) > SERVICE_VERSION )
    {
      return true;
    }

    // get curent time (ms)
    var cur_date = new Date().getTime();

    // don't proceed if we checked for new version in last 3 days
    if ( last_check && !force )
    {
      var days_since_check = (cur_date-last_check)/(1000*60*60*24);
      if ( days_since_check < 3 ) return false;
    }

    // update last check data
    setPref('lastCheck', cur_date);

    var req = new XMLHttpRequest();
    req.onreadystatechange = function()
    {
      if ( req.readyState == 4 )
      {
        var
          doap = req.responseXML,
          remoteVersion = null;

        if ( !doap ) return false;

        var nsresolve = function(ns)
        {
          switch(ns)
          {
            case 'rdf': return 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
            case 'doap': return 'http://usefulinc.com/ns/doap#';
          }
        }

        // compare with current version
        if ( remoteVersion = doap.selectSingleNode('//rdf:RDF/doap:Project/doap:release/doap:Version/doap:revision', nsresolve) )
        {
          remoteVersion = remoteVersion.textContent;
          if ( latest_ver && parseFloat(remoteVersion) > parseFloat(latest_ver) )
          {
            setPref('latestVer', remoteVersion);
            return true;
          }
          else
          {
            setPref('latestVer', remoteVersion);
          }
        }
        return false;
      }
    }
    req.open('GET', SERVICE_DOAP, false);
    req.setRequestHeader('Cache-Control', 'no-cache');
    req.send();
  };

  this.remindMeLater = function()
  {
    setPref('latestVer', latest_ver=SERVICE_VERSION);
    setPref('lastCheck', last_check=new Date().getTime());
  }
}

/**
  * Webserver functions
  */
var PublicFiles = new function()
{
  var files = [];

  this.share = function(path)
  {
    var dir = APP_DIR.resolve(path);
    dir.refresh();

    for ( var i=0,File; File=dir[i]; i++ )
    {
      if ( File.isFile )
      {
        var path = File.path, match = null;
        if ( match = File.path.match(/(\/[^\/]+)$/) )
        {
          path = match[1];
        }
        files.push( path );
      }
      else
      {
        PublicFiles.share(File.path);
      }
    }
  }

  this.isPublic = function(uri)
  {
    for ( var i=0; i<files.length; i++ )
    {
      var item = files[i];
      if ( uri.indexOf(item)>-1 )
        return true;
    }
    return false;
  }
}
PublicFiles.share('/public_html/');

function saveScriptDownloadURL(filename, url)
{
  if (!window.localStorage || !filename || !url)
    return false;

  var urls = localStorage.download_urls||"{}";
  urls = JSON.parse(urls);
  urls[filename] = url;
  localStorage.download_urls = JSON.stringify(urls);

  return true;
}