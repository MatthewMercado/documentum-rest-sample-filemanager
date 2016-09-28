(function(angular, $) {
    'use strict';
    angular.module('dctmNgFileManager')
    .controller('FileManagerController', [
        '$scope', '$rootScope', '$window', '$translate', 'fileManagerConfig', 'item', 'fileNavigator', 'apiMiddleware', 
        function($scope, $rootScope, $window, $translate, fileManagerConfig, Item, FileNavigator, ApiMiddleware) {

        var $storage = $window.localStorage;
        $scope.config = fileManagerConfig;
        $scope.reverse = false;
        $scope.predicate = ['model.type', 'model.name'];
        $scope.order = function(predicate) {
            $scope.reverse = ($scope.predicate[1] === predicate) ? !$scope.reverse : false;
            $scope.predicate[1] = predicate;
        };
        $scope.query = '';
        $scope.search = '';
        $scope.fileNavigator = new FileNavigator();
        $scope.apiMiddleware = new ApiMiddleware();
        $scope.uploadFileList = [];
        $scope.viewTemplate = $storage.getItem('viewTemplate') || 'main-table.html';
        $scope.fileList = [];
        $scope.temps = [];


        $scope.getRepositoryList = function() {
            $scope.apiMiddleware.listRepositories();
        };

        $scope.login = function() {
            $scope.apiMiddleware.login().then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('signin', true);
            });
        };

        $scope.logout = function() {
            $scope.apiMiddleware.logout();
            $scope.modal('signout', true);
        };

        $scope.prepareNewFolder = function() {
            var item = new Item($scope.fileNavigator.folderObject, $scope.fileNavigator.currentPath);
            $scope.temps = [item];
            return item;
        };

        $scope.createFolder = function() {
            var itemLocal = $scope.singleSelection();
            var name = itemLocal.tempModel.name;
            //added
            itemLocal.tempModel.id = $scope.fileNavigator.folderId ;
            itemLocal.tempModel.object = $scope.fileNavigator.folderObject;

            if (!name || $scope.fileNavigator.fileNameExists(name)) {
                return $scope.apiMiddleware.restClient.error = $translate.instant('error_invalid_filename');
            }

            $scope.apiMiddleware.createFolder(itemLocal.tempModel).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('newfolder', true);
            });
        };

        $scope.nextPage = function() {
            if ($scope.search == '') {
                $scope.fileNavigator.nextPage();
            } else {
                if(!$scope.fileNavigator.hasNext()){
                    console.log("No More Pages");
                    return;
                }
                $scope.fileNavigator.pageNumber++;
                return search();
            }
        };

        $scope.previousPage = function() {
            if ($scope.search == '') {
                $scope.fileNavigator.previousPage();
            } else {
                if(!$scope.fileNavigator.hasPrevious()){
                    console.log("No Previous Pages");
                    return;
                }
                $scope.fileNavigator.pageNumber--;
                return search();
            }
        };

        $scope.ftSearch = function() {
            if ($scope.search == '') {
                $scope.fileNavigator.refresh();
            } else {
                return search();
            }
        };

        var search = function() {
            var currentFullPath = $scope.fileNavigator.currentFullPath();
            var currentPage = $scope.fileNavigator.pageNumber;
            var currentPageSize = $scope.fileNavigator.pageSize;
            return $scope.apiMiddleware.ftSearch($scope.search, currentFullPath, currentPage, currentPageSize)
                .then(function(data) {
                    var objects = $scope.apiMiddleware.parseEntries(data);
                    $scope.fileNavigator.fileList = (objects || []).map(function(file) {
                        return new Item(file, "/");
                    });
                    $scope.fileNavigator.buildTree("/");
                });
        };

        $scope.uploadFiles = function() {
            $scope.apiMiddleware.upload($scope.uploadFileList, $scope.fileNavigator.currentPath, $scope.fileNavigator.folderObject).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('uploadfile', true);
            }, function(data) {
                var errorMsg = data.result && data.result.error || $translate.instant('error_uploading_files');
                $scope.apiMiddleware.restClient.error = errorMsg;
            });
        };

        $scope.remove = function() {
            $scope.apiMiddleware.remove($scope.temps).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('remove', true);
            });
        };

        $scope.download = function() {
            var item = $scope.singleSelection();
            if ($scope.selectionHas('dir')) {
                return;
            }
            if (item) {
                return $scope.apiMiddleware.download(item);
            }
            return $scope.apiMiddleware.downloadMultiple($scope.temps);
        };

        $scope.openImagePreview = function() {
            var item = $scope.singleSelection();
            $scope.apiMiddleware.restClient.inprocess = true;
            $scope.apiMiddleware.getContentMeta(item, true).then(function(data) {
                // TODO for MMTM R4: Find ACS content link relation from content resource START 
                var acsUrl = $scope.apiMiddleware.restClient.findUrlGivenLinkRelation(data, 'mmtm-r4-find-acs-link-relation');
                // TODO for MMTM R4: Find ACS content link relation from content resource END 
                $scope.modal('imagepreview', null, true)
                    .find('#imagepreview-target')
                    .attr('src', acsUrl)
                    .unbind('load error')
                    .on('load error', function() {
                        $scope.apiMiddleware.restClient.inprocess = false;
                        $scope.$apply();
                    });
            });
        };

        $scope.rename = function() {
            var item = $scope.singleSelection();
            var name = item.tempModel.name;
            var samePath = item.tempModel.path.join('') === item.model.path.join('');
            if (!name || (samePath && $scope.fileNavigator.fileNameExists(name))) {
                $scope.apiMiddleware.restClient.error = $translate.instant('error_invalid_filename');
                return false;
            }
            $scope.apiMiddleware.rename(item).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('rename', true);
            });
        };

        $scope.openEditItem = function() {
            var item = $scope.singleSelection();
            $scope.apiMiddleware.getContent(item).then(function(data) {
                item.tempModel.content = item.model.content = String.fromCharCode.apply(null, new Uint8Array(data));
            });
            $scope.modal('edit');
        };

        $scope.edit = function() {
            $scope.apiMiddleware.edit($scope.singleSelection()).then(function() {
                $scope.modal('edit', true);
            });
        };

        $scope.move = function() {
            var anyItem = $scope.singleSelection() || $scope.temps[0];
            if (anyItem && validateSamePath(anyItem)) {
                $scope.apiMiddleware.restClient.error = $translate.instant('error_cannot_move_same_path');
                return false;
            }
            $scope.apiMiddleware.move($scope.temps, $scope.fileNavigator.folderObject, $rootScope.selectedModalObject).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('move', true);
            });
        };

        $scope.copy = function() {
            var item = $scope.singleSelection();
            if (item) {
                var name = item.tempModel.name.trim();
                var nameExists = $scope.fileNavigator.fileNameExists(name);
                if (nameExists && validateSamePath(item)) {
                    $scope.apiMiddleware.restClient.error = $translate.instant('error_invalid_filename');
                    return false;
                }
                if (!name) {
                    $scope.apiMiddleware.restClient.error = $translate.instant('error_invalid_filename');
                    return false;
                }
            }
            $scope.apiMiddleware.copy($scope.temps, $rootScope.selectedModalObject).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('copy', true);
            });
        };


        /************** line separator for implemented APIs ************/


        $scope.changePermissions = function() {
            $scope.apiMiddleware.changePermissions($scope.temps, $scope.temp).then(function() {
                $scope.modal('changepermissions', true);
            });
        };

        $scope.compress = function() {
            var name = $scope.temp.tempModel.name.trim();
            var nameExists = $scope.fileNavigator.fileNameExists(name);

            if (nameExists && validateSamePath($scope.temp)) {
                $scope.apiMiddleware.restClient.error = $translate.instant('error_invalid_filename');
                return false;
            }
            if (!name) {
                $scope.apiMiddleware.restClient.error = $translate.instant('error_invalid_filename');
                return false;
            }

            $scope.apiMiddleware.compress($scope.temps, name, $rootScope.selectedModalPath).then(function() {
                $scope.fileNavigator.refresh();
                if (! $scope.config.compressAsync) {
                    return $scope.modal('compress', true);
                }
                $scope.apiMiddleware.restClient.asyncSuccess = true;
            }, function() {
                $scope.apiMiddleware.restClient.asyncSuccess = false;
            });
        };

        $scope.extract = function() {
            var item = $scope.temp;
            var name = $scope.temp.tempModel.name.trim();
            var nameExists = $scope.fileNavigator.fileNameExists(name);

            if (nameExists && validateSamePath($scope.temp)) {
                $scope.apiMiddleware.restClient.error = $translate.instant('error_invalid_filename');
                return false;
            }
            if (!name) {
                $scope.apiMiddleware.restClient.error = $translate.instant('error_invalid_filename');
                return false;
            }

            $scope.apiMiddleware.extract(item, name, $rootScope.selectedModalPath).then(function() {
                $scope.fileNavigator.refresh();
                if (! $scope.config.extractAsync) {
                    return $scope.modal('extract', true);
                }
                $scope.apiMiddleware.restClient.asyncSuccess = true;
            }, function() {
                $scope.apiMiddleware.restClient.asyncSuccess = false;
            });
        };

        $scope.$watch('temps', function() {
            if ($scope.singleSelection()) {
                $scope.temp = $scope.singleSelection();
            } else {
                $scope.temp = new Item({rights: 644});
                $scope.temp.multiple = true;
            }
            $scope.temp.revert();
        });

        $scope.fileNavigator.onRefresh = function() {
            $scope.temps = [];
            $rootScope.selectedModalPath = $scope.fileNavigator.currentPath;
            $rootScope.selectedModalObject = $scope.fileNavigator.folderObject;
        };

        $scope.setTemplate = function(name) {
            $storage.setItem('viewTemplate', name);
            $scope.viewTemplate = name;
        };

        $scope.changeLanguage = function (locale) {
            if (locale) {
                $storage.setItem('language', locale);
                return $translate.use(locale);
            }
            $translate.use($storage.getItem('language') || fileManagerConfig.defaultLang);
        };

        $scope.isSelected = function(item) {
            return $scope.temps.indexOf(item) !== -1;
        };

        $scope.selectOrUnselect = function(item, $event) {
            var indexInTemp = $scope.temps.indexOf(item);
            var isRightClick = $event && $event.which == 3;

            if ($event && $event.target.hasAttribute('prevent')) {
                $scope.temps = [];
                return;
            }
            if (! item || (isRightClick && $scope.isSelected(item))) {
                return;
            }
            if ($event && $event.shiftKey && !isRightClick) {
                var list = $scope.fileList;
                var indexInList = list.indexOf(item);
                var lastSelected = $scope.temps[0];
                var i = list.indexOf(lastSelected);
                var current = undefined;
                if (lastSelected && list.indexOf(lastSelected) < indexInList) {
                    $scope.temps = [];
                    while (i <= indexInList) {
                        current = list[i];
                        !$scope.isSelected(current) && $scope.temps.push(current);
                        i++;
                    }
                    return;
                }
                if (lastSelected && list.indexOf(lastSelected) > indexInList) {
                    $scope.temps = [];
                    while (i >= indexInList) {
                        current = list[i];
                        !$scope.isSelected(current) && $scope.temps.push(current);
                        i--;
                    }
                    return;
                }
            }
            if ($event && $event.ctrlKey && !isRightClick) {
                $scope.isSelected(item) ? $scope.temps.splice(indexInTemp, 1) : $scope.temps.push(item);
                return;
            }
            $scope.temps = [item];
        };

        $scope.singleSelection = function() {
            return $scope.temps.length === 1 && $scope.temps[0];
        };

        $scope.totalSelecteds = function() {
            return {
                total: $scope.temps.length
            };
        };

        $scope.selectionHas = function(type) {
            return $scope.temps.find(function(item) {
                return item && item.model.type === type;
            });
        };

        $scope.smartClick = function(item) {
            if (item.isFolder()) {
                return $scope.fileNavigator.folderClick(item);
            }
            if (item.isImage()) {
                if ($scope.config.previewImagesInModal) {
                    return $scope.openImagePreview(item);
                }
                return $scope.apiMiddleware.download(item, true);
            }
            if (item.isEditable()) {
                return $scope.openEditItem(item);
            }
        };

        $scope.modal = function(id, hide, returnElement) {
            var element = $('#' + id);
            element.modal(hide ? 'hide' : 'show');
            $scope.apiMiddleware.restClient.error = '';
            $scope.apiMiddleware.restClient.asyncSuccess = false;
            return returnElement ? element : true;
        };

        $scope.modalWithPathSelector = function(id) {
            $rootScope.selectedModalPath = $scope.fileNavigator.currentPath;
            $rootScope.selectedModalObject = $scope.fileNavigator.folderObject;
            return $scope.modal(id);
        };

        $scope.isInThisPath = function(path) {
            var currentPath = $scope.fileNavigator.currentPath.join('/');
            return currentPath.indexOf(path) !== -1;
        };

        var validateSamePath = function(item) {
            var selectedPath = $rootScope.selectedModalPath.join('');
            var selectedItemsPath = item && item.model.path.join('');
            return selectedItemsPath === selectedPath;
        };

        var getQueryParam = function(param) {
            var found = $window.location.search.substr(1).split('&').filter(function(item) {
                return param ===  item.split('=')[0];
            });
            return found[0] && found[0].split('=')[1] || undefined;
        };

        $scope.changeLanguage(getQueryParam('lang'));
        $scope.isWindows = getQueryParam('server') === 'Windows';
        if (fileManagerConfig.signedin) {
            $scope.fileNavigator.refresh();
        }
        else {
            $scope.modal('signin');
        }

    }]);
})(angular, jQuery);
