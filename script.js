// script.js
// КОНФИГУРАЦИЯ
// ===============
// ВАЖНО: Вставьте сюда вашу ссылку на опубликованную Google Таблицу в формате CSV!
const GOOGLE_SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTLW2kvPGc83XLEV3qANk88LnS_NIOrVUnimDD0SyVpCcc3lI8xS4EXQRuMZ_2HpNpbZjgXI2sSGqa4/pub?output=csv';

// Центр и зум карты по умолчанию
const MAP_CONFIG = {
    center: [55.7558, 37.6173], // Москва
    zoom: 3,
    minZoom: 2,
    maxZoom: 18
};

// Глобальные переменные
let map = null;
let allGraduates = [];          // Все загруженные данные
let filteredGraduates = [];     // Данные после применения фильтров
let markersLayer = null;        // Слой с маркерами на карте (для легкого удаления)

// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ===================
function initMap() {
    // Создаем карту в контейнере #map
    map = L.map('map', {
        center: MAP_CONFIG.center,
        zoom: MAP_CONFIG.zoom,
        minZoom: MAP_CONFIG.minZoom,
        maxZoom: MAP_CONFIG.maxZoom,
        worldCopyJump: false, // Важно! Отключаем "прыжки" между копиями мира
        maxBounds: [           // Ограничиваем область карты
            [-85, -180],      // Юго-западный угол (нижняя граница)
            [85, 180]         // Северо-восточный угол (верхняя граница)
        ],
        maxBoundsViscosity: 1.0
    });

    // Добавляем слой карты OpenStreetMap (бесплатный)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: MAP_CONFIG.maxZoom
    }).addTo(map);

    // Дополнительно: ставим обработчик на попытку выйти за границы
    map.on('drag', function() {
        map.panInsideBounds([[-85, -180], [85, 180]], { animate: false });
    });

    // Создаем пустой слой для маркеров
    markersLayer = L.layerGroup().addTo(map);
    console.log('Карта инициализирована');
}

// ЗАГРУЗКА ДАННЫХ ИЗ GOOGLE SHEETS
// ==================================
function loadDataFromGoogleSheets() {
    console.log('Начинаю загрузку данных...');
    
    Papa.parse(GOOGLE_SHEETS_CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        
        complete: function(results) {
            console.log('CSV загружен. Колонки:', Object.keys(results.data[0] || {}));
            
            // Преобразуем русские названия в английские
            allGraduates = results.data.map(row => {

                // Создаем стандартизированный объект
                const graduate = {
                    full_name: `${row['Фамилия (сейчас)']} ${row.Имя} ${row.Отчество || ''}`.trim(),
                    prev_last_name: row['Фамилия (во время учебы)'] || '',
                    graduation_year: row['Год выпуска'],
                    city: row['Город проживания'],
                    country: row['Страна проживания'],
                    latitude: parseFloat(row.Широта),
                    longitude: parseFloat(row.Долгота),
                    profession: row.Профессия || '',
                    timestamp: row['Отметка времени']
                };
                
                console.log('Обработан:', graduate.full_name, graduate.prev_last_name, graduate.latitude, graduate.longitude);
                return graduate;
            }).filter(g => 
                g.latitude && g.longitude && g.full_name && 
                !isNaN(g.latitude) && !isNaN(g.longitude)
            );
            
            console.log('После фильтрации осталось:', allGraduates.length);
            
            if (allGraduates.length > 0) {
                updateLastUpdateTime();
                updateFiltersDropdowns(allGraduates);
                updateStatistics(allGraduates);
                displayGraduatesOnMap(allGraduates);
            } else {
                console.log('Все строки:', results.data);
            }
        },
        
        error: function(error) {
            console.error('Ошибка CSV:', error);
        }
    });
}

// ОТОБРАЖЕНИЕ ВЫПУСКНИКОВ НА КАРТЕ
// ================================
function getInitials(fullName) {
    if (!fullName) return '??';
    
    // Берем первые буквы первых двух слов (Фамилия Имя)
    const parts = fullName.split(' ').filter(p => p.trim() !== '');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    } else if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return '??';
}

function displayGraduatesOnMap(graduates) {
    // 1. Очищаем старые маркеры
    markersLayer.clearLayers();
    
    // 2. Создаем кластер маркеров для оптимизации
    const markerCluster = L.markerClusterGroup({
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 15
    });
    
    // 3. Для каждого выпускника создаем маркер
    graduates.forEach(grad => {
        // Определяем цвет маркера по году выпуска
        const color = getMarkerColorByYear(grad.graduation_year);
        
        // Создаем кастомную иконку с цветом и годом
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `
                <div style="
                    background-color: ${color};
                    width: 34px;
                    height: 34px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 13px;
                    cursor: pointer;
                ">
                    ${getInitials(grad.full_name)}
                </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 34]
        });
        
        // Создаем маркер
        const marker = L.marker([grad.latitude, grad.longitude], { icon });
        
        // Добавляем всплывающее окно (popup)
        const popupContent = createPopupContent(grad);
        marker.bindPopup(popupContent, { maxWidth: 300 });
        
        // При клике на маркер подсвечиваем запись в списке
        marker.on('click', function() {
            highlightGraduateInList(grad.full_name);
        });
        
        // Добавляем маркер в кластер
        markerCluster.addLayer(marker);
    });
    
    // 4. Добавляем кластер на карту через наш слой
    markersLayer.addLayer(markerCluster);
    
    // 5. Если есть выпускники, подстраиваем карту чтобы показать их всех
    if (graduates.length > 0) {
        const bounds = L.latLngBounds(graduates.map(g => [g.latitude, g.longitude]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    }
}

// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ КАРТЫ
// ==================================
function getMarkerColorByYear(year) {
    if (!year) return '#3498db';
    if (year < 2000) return '#e74c3c'; // Красный для старших выпусков
    if (year >= 2000 && year < 2010) return '#f39c12'; // Оранжевый
    if (year >= 2010 && year < 2020) return '#3498db'; // Синий
    return '#2ecc71'; // Зеленый для новых выпусков
}

function createPopupContent(graduate) {
    return `
        <div class="leaflet-popup-content">
            <div class="popup-header">
                ${graduate.prev_last_name !== '' ? 
                    `<h4>${graduate.full_name} (бывш. ${graduate.prev_last_name})</h4>` : 
                    `<h4>${graduate.full_name}</h4>`
                }
                <p style="color:#7f8c8d; margin-bottom: 8px;">
                    <i class="fas fa-graduation-cap"></i> Выпуск ${graduate.graduation_year}
                </p>
            </div>
            <div class="popup-body">
                <p><i class="fas fa-map-marker-alt"></i> ${graduate.city}, ${graduate.country}</p>
                ${graduate.profession ? `<p><i class="fas fa-briefcase"></i> ${graduate.profession}</p>` : ''}
                ${graduate.telegram || graduate.email ? 
                    `<p><i class="fas fa-envelope"></i> ${graduate.telegram || graduate.email}</p>` : ''}
                ${graduate.photo_url ? `
                    <div style="margin-top: 10px;">
                        <img src="${graduate.photo_url}" 
                             alt="${graduate.full_name}" 
                             style="width:100%; border-radius: 6px; margin-top: 8px;">
                    </div>` : ''}
                ${graduate.comment ? `<p style="margin-top: 10px; font-style: italic;">"${graduate.comment}"</p>` : ''}
            </div>
        </div>
    `;
}

// ОБНОВЛЕНИЕ ИНТЕРФЕЙСА: СТАТИСТИКА, СПИСКИ, ФИЛЬТРЫ
// ===================================================
function updateLastUpdateTime() {
    const now = new Date();
    const formattedTime = now.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    const formattedDate = now.toLocaleDateString('ru-RU');
    document.getElementById('lastUpdate').textContent = `${formattedDate} ${formattedTime}`;
}

function updateStatistics(graduates) {
    if (graduates.length === 0) {
        document.getElementById('totalCount').textContent = '0';
        document.getElementById('countryCount').textContent = '0';
        document.getElementById('yearRange').textContent = '-';
        return;
    }
    
    // Подсчет общего количества
    document.getElementById('totalCount').textContent = graduates.length;
    
    // Подсчет уникальных стран
    const uniqueCountries = [...new Set(graduates.map(g => g.country))].filter(Boolean);
    document.getElementById('countryCount').textContent = uniqueCountries.length;
    
    // Определение диапазона годов
    const years = graduates.map(g => g.graduation_year).filter(y => y);
    if (years.length > 0) {
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        document.getElementById('yearRange').textContent = 
            minYear === maxYear ? `${minYear}` : `${minYear}-${maxYear}`;
    }
}

function updateFiltersDropdowns(graduates) {
    const yearFilter = document.getElementById('yearFilter');
    const countryFilter = document.getElementById('countryFilter');
    
    // Получаем уникальные годы и страны
    const years = [...new Set(graduates.map(g => g.graduation_year).filter(y => y))].sort((a,b) => b-a);
    const countries = [...new Set(graduates.map(g => g.country).filter(c => c))].sort();
    
    // Очищаем старые опции (кроме "Все")
    while (yearFilter.options.length > 1) yearFilter.remove(1);
    while (countryFilter.options.length > 1) countryFilter.remove(1);
    
    // Добавляем новые опции
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });
    
    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        countryFilter.appendChild(option);
    });
}

// ПОИСК И ФИЛЬТРАЦИЯ
// ==================
function performSearch() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const selectedYear = document.getElementById('yearFilter').value;
    const selectedCountry = document.getElementById('countryFilter').value;
    
    // Фильтруем данные
    filteredGraduates = allGraduates.filter(graduate => {
        // Поиск по имени или городу
        const matchesSearch = searchTerm === '' || 
            graduate.full_name.toLowerCase().includes(searchTerm) ||
            (graduate.city && graduate.city.toLowerCase().includes(searchTerm)) ||
            (graduate.country && graduate.country.toLowerCase().includes(searchTerm));
        
        // Фильтр по году
        const matchesYear = selectedYear === 'all' || 
            String(graduate.graduation_year) === selectedYear;
        
        // Фильтр по стране
        const matchesCountry = selectedCountry === 'all' || 
            graduate.country === selectedCountry;
        
        return matchesSearch && matchesYear && matchesCountry;
    });
    
    // Обновляем отображение
    displayGraduatesOnMap(filteredGraduates);
    updateStatistics(filteredGraduates);
}

function highlightGraduateInList(name) {
    // Убираем подсветку у всех
    document.querySelectorAll('.graduate-item').forEach(item => {
        item.style.boxShadow = 'none';
        item.style.backgroundColor = '';
    });
    
    // Подсвечиваем нужный элемент
    const targetItem = document.querySelector(`.graduate-item[data-name="${name}"]`);
    if (targetItem) {
        targetItem.style.boxShadow = '0 0 0 3px #3498db';
        targetItem.style.backgroundColor = '#e8f4fc';
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ИНИЦИАЛИЗАЦИЯ И ЗАПУСК
// ======================
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM загружен, инициализирую приложение...');
    
    // 1. Инициализируем карту
    initMap();
    
    // 2. Загружаем данные
    loadDataFromGoogleSheets();
    
    // 3. Настраиваем обработчики событий для поиска и фильтров
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('searchInput').addEventListener('keyup', function(event) {
        if (event.key === 'Enter') performSearch();
    });
    
    document.getElementById('yearFilter').addEventListener('change', performSearch);
    document.getElementById('countryFilter').addEventListener('change', performSearch);
    
    document.getElementById('resetFilters').addEventListener('click', function() {
        document.getElementById('searchInput').value = '';
        document.getElementById('yearFilter').value = 'all';
        document.getElementById('countryFilter').value = 'all';
        performSearch();
    });
    
    // 4. Автообновление данных каждую минуту
    setInterval(loadDataFromGoogleSheets, 1 * 60 * 1000);
    
    console.log('Приложение инициализировано, ожидаю данные...');
});
