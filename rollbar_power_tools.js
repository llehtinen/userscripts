// ==UserScript==
// @name         Rollbar power tools
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Buttons that make working with Rollbar easier
// @author       llehtinen
// @match        https://rollbar.com/*/*/items/*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    var search = function(query) {
        $.ajax('https://rollbar.com/TransferWise/_/encrypt_query.json', {
            data : JSON.stringify({query: query}),
            contentType : 'application/json',
            type : 'POST',
            success : function(data) {
                var baseUrl = window.location.origin + window.location.pathname.replace(/\/items\/\d+\/.*$/, '/items/');
                var queryString = "?enc_query=" + encodeURIComponent(data.encrypted_query);
                window.open(baseUrl + queryString, '_blank');
            },
            dataType: 'json'
        });
    };

    //----------------------------------------------------------------
    // Add button to search for exception+message
    //----------------------------------------------------------------
    var exceptionSearch = $('<button>Search</button>');
    exceptionSearch.on('click', function(e) {
        var div = $(this).parent();
        var arr = div.text().trim().split("\n");
        var originalTitle = arr[0].trim() + " " + arr[1].trim();
        // rollbar max length of searchable item title is 256
        var truncated = originalTitle.substring(0, Math.min(originalTitle.length, 255));
        truncated = truncated.replace(arr[0].trim(), '');
        var query = "exception:" + arr[0].trim().replace(':', '') + " " + truncated;
        search(query);
    });
    $('div.exception').find('br').remove(); // button on same row
    exceptionSearch.appendTo($('div.exception'));

    //----------------------------------------------------------------
    // Add button next to each line to search for the file and method
    //----------------------------------------------------------------
    var fileSearch = $('<button class="script-btn">Search</button>');
    fileSearch.on('click', function(e) {
        var parts = $(this).parent().find('span.filename').first().text().split(".");
        var file = parts[parts.length - 2];
        var method = parts[parts.length - 1];
        var query = "file:" + file + " method:" + method;
        search(query);
    });
    fileSearch.appendTo($('div.framedata div.location'));

    //----------------------------------------------------------------
    // Add button next to each line to copy fingerprint rule to
    // clipboard
    //----------------------------------------------------------------
    var copyRuleBtn = $('<button class="script-btn" style="margin-left: 5px;">Copy rule</button>');
    copyRuleBtn.on('click', function(event) {

        var stackNo = 0;
        var tmp = $(this).closest('.traceback-inner').prev();
        while (tmp.next().length) {
            tmp = tmp.next();
            if (tmp.hasClass('exception')) {
                stackNo++;
            }
        }

        // find exception class and message
        tmp = $(this).closest('.traceback-inner').prev();
        while (!tmp.hasClass('exception')) {
            tmp = tmp.prev();
        }
        var lines = tmp.text().trim().split("\n");
        var exceptionClass = lines[0].trim().replace(':', '');
        var exceptionMessage = lines[1].trim();

        // find filename and method
        var linkedFile = $(this).parent().find('.linked-filename, span.filename:nth-child(2)').first().text().split(":")[0];
        var parts = $(this).parent().find('span.filename').first().text().split(".");
        var method = parts[parts.length - 1];

        // group item id
        var itemId = 'REPLACE_WITH_GROUP_ITEM_ID'
        if ($('.svgicon-commongroup').length) {
            // the current item is a group item
            itemId = window.location.pathname.match(/items\/(\d+)\//)[1]
        }

        var ruleJson = `
  {
    "condition": {
      "all": [
        {
          "eq": "${exceptionClass}",
          "path": "body.trace_chain.${stackNo}.exception.class"
        },
        {
          "path": "body.trace_chain.${stackNo}.exception.message",
          "startswith": "${exceptionMessage}"
        },
        {
          "eq": "${linkedFile}",
          "path": "body.trace_chain.${stackNo}.frames.*.filename"
        },
        {
          "eq": "${method}",
          "path": "body.trace_chain.${stackNo}.frames.*.method"
        }
      ]
    },
    "fingerprint": "group-item-${itemId}"
  }
`;
        navigator.clipboard.writeText(ruleJson);
    });
    copyRuleBtn.appendTo($('div.framedata div.location').has('.linked-filename, span.filename:nth-child(2)'));

    //----------------------------------------------------------------
    // Add button next to each occurrence to copy its id to
    // clipboard
    //----------------------------------------------------------------
    if (window.location.hash == '#instances') {
        var interval = setInterval(() => {
            if ($('div#instances tbody tr td:first-of-type').children().length) {
                var copyInstanceIdBtn = $('<button>Copy</button>');
                copyInstanceIdBtn.on('click', function(event) {
                    var occurrenceId = $(this).parent().find('a').attr('href').replace(/.*\/(\d+)\//g, '$1');
                    navigator.clipboard.writeText(occurrenceId);
                });
                copyInstanceIdBtn.appendTo($('div#instances tbody tr td:first-of-type'));

                clearInterval(interval);
            }
        }, 1000);
    }

    //----------------------------------------------------------------
    // Add button to create JIRA issue, or to show existing one if
    // item title contains issue id.
    // (Yes, there is an official JIRA integration, but sometimes
    // companies don't want to give Rollbar access to their JIRA.)
    //----------------------------------------------------------------
    var jiraBaseUrl = 'https://EDIT_THIS.atlassian.net';
    var jiraProperties = {};

    // Quickest way to figure out numeric project and issue type ids:
    // open a JIRA issue of the type you want, view source, search for 'pid' or 'projectid', and 'issuetype'

    // [<Rollbar project name>] = [JIRA project id, JIRA issue type id, label
    jiraProperties['my-project'] = [-1, -1, 'my-label'];

    if (jiraBaseUrl.indexOf('EDIT_THIS') == -1) { console.log('Please set the JIRA variables in Rollbar power tools script'); }

    $('.create-issue-container').remove();
    var container = $('<div class="create-issue-container"><div class="btn-toolbar"><div class="btn-group"></div></div></div>');
    var btnGroup = container.find('.btn-group');
    var title = $('#item-title-control').find('span.editable-content').text();
    var arr = title.match(/\[([A-Z]+-\d+)\]/)

    if (arr) {
        // link to existing issue
        var url = jiraBaseUrl + '/browse/' + arr[1];
        $('<a class="btn" target="_blank" href="' + url + '">Show JIRA issue</a>').appendTo(btnGroup);
    } else {
        var match = window.location.pathname.match(/\/[^\/]+\/([^\/]+)\/items/)
        var rollbarProject = match[1];
        var jiraProps = jiraProperties[rollbarProject];
        if (jiraProps) {
            // create new issue
            var occurrencesLink = window.location.origin + window.location.pathname + '?item_page=0&item_count=100&#instances';
            var params = {
                pid: jiraProps[0],
                issuetype: jiraProps[1],
                labels: jiraProps[2],
                summary: title,
                description: occurrencesLink
            };
            var encodedParams = Object.entries(params).map(e => e[0] + '=' + encodeURIComponent(e[1])).join('&');
            var href = jiraBaseUrl + '/CreateIssueDetails!init.jspa?' + encodedParams;
            $('<a class="btn" target="_blank" href="' + href + '">Create JIRA issue</a>').appendTo(btnGroup);
        }
    }
    $('#react-status-level-container').after(container);

})();