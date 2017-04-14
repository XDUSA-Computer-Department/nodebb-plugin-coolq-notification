(function(module) {
	'use strict';

	var User = module.parent.require('./user');
	var Topics = module.parent.require('./topics');
	var Categories = module.parent.require('./categories');
	var meta = module.parent.require('./meta');
	var nconf = module.parent.require('nconf');
	var async = module.parent.require('async');

	var Discord = require('discord.js');

	var hook = null;

	var plugin = {
			config: {
				'WebhookID': '',
				'WebhookToken': '',
				'MaxLength': '',
				'PostCategories': '',
				'TopicsOnly': ''
			}
		};

	plugin.init = function(params, callback) {
		function render(req, res, next) {
			res.render('admin/plugins/discord-notification', {});
		}

		params.router.get('/admin/plugins/discord-notification', params.middleware.admin.buildHeader, render);
		params.router.get('/api/admin/plugins/discord-notification', render);

		meta.settings.get('discord-notification', function(err, settings) {
			for (var prop in plugin.config) {
				if (settings.hasOwnProperty(prop)) {
					plugin.config[prop] = settings[prop];
				}
			}

			hook = new Discord.WebhookClient(plugin.config['WebhookID'], plugin.config['WebhookToken']);
		});

		callback();
	},

	plugin.postSave = function(post) {
		var topicsOnly = plugin.config['TopicsOnly'] || 'off';

		if (topicsOnly === 'off' || (topicsOnly === 'on' && post.isMain)) {
			var content = post.content;

			async.parallel({
				user: function(callback) {
					User.getUserFields(post.uid, ['username', 'picture'], callback);
				},
				topic: function(callback) {
					Topics.getTopicFields(post.tid, ['title', 'slug'], callback);
				},
				category: function(callback) {
					Categories.getCategoryFields(post.cid, ['name'], callback);
				}
			}, function(err, data) {
				var categories = JSON.parse(plugin.config['PostCategories']);

				if (!categories || categories.indexOf(String(post.cid)) >= 0) {
					// Trim long posts:
					var maxContentLength = plugin.config['MaxLength'] || 1024;
					if (content.length > maxContentLength) { content = content.substring(0, maxContentLength) + '...'; }

					// Ensure absolute thumbnail URL:
					var thumbnail = data.user.picture.match(/^\/\//) ? 'http:' + data.user.picture : data.user.picture;

					// Make the rich embed:
					var embed = new Discord.RichEmbed()
						.setURL(nconf.get('url') + '/topic/' + data.topic.slug)
						.setTitle(data.category.name + ': ' + data.topic.title)
						.setDescription(content)
						.setFooter(data.user.username, thumbnail)
						.setTimestamp();

					hook.sendMessage('', {embeds: [embed]}).catch(console.error);
				}
			});
		}
	},

	plugin.adminMenu = function(headers, callback) {
		headers.plugins.push({
			route : '/plugins/discord-notification',
			icon  : 'fa-bell',
			name  : 'Discord Notifications'
		});

		callback(null, headers);
	};

	module.exports = plugin;

}(module));
