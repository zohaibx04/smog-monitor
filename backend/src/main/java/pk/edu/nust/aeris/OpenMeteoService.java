package pk.edu.nust.aeris;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.TreeMap;

@Service
class OpenMeteoService {
    static final String SOURCE = "Open-Meteo / CAMS model estimate";
    private final RestClient client;
    private final ReadingRepository readings;

    OpenMeteoService(ReadingRepository readings,
                     @Value("${aeris.air-quality-url:https://air-quality-api.open-meteo.com}") String baseUrl) {
        this.readings = readings;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(8));
        client = RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }

    String refresh(MonitoredArea area) {
        JsonNode payload;
        try {
            payload = client.get().uri(uri -> uri.path("/v1/air-quality")
                .queryParam("latitude", area.latitude).queryParam("longitude", area.longitude)
                .queryParam("hourly", "us_aqi,pm2_5,pm10")
                .queryParam("past_days", 7).queryParam("forecast_days", 1)
                .queryParam("timezone", "GMT").build()).retrieve().body(JsonNode.class);
        } catch (RestClientException e) {
            return "Open-Meteo is unavailable. Stored estimates are retained.";
        }

        Instant now = Instant.now();
        var available = parse(payload, area.id, now);
        boolean recent = !available.isEmpty() && !available.lastKey().isBefore(now.minus(Duration.ofHours(3)));
        var existing = readings.findByAreaIdAndSourceAndTimestampBetweenOrderByTimestampAsc(
            area.id, SOURCE, now.minus(Duration.ofDays(8)), now);
        existing.forEach(reading -> available.remove(reading.timestamp));
        readings.saveAll(available.values());
        return recent ? null : "Open-Meteo did not return a recent air-quality estimate.";
    }

    static TreeMap<Instant, SmogReading> parse(JsonNode payload, Long areaId, Instant now) {
        var result = new TreeMap<Instant, SmogReading>();
        if (payload == null) return result;
        var hourly = payload.path("hourly");
        var times = hourly.path("time");
        for (int index = 0; index < times.size(); index++) {
            Instant timestamp;
            try {
                timestamp = LocalDateTime.parse(times.path(index).asText()).toInstant(ZoneOffset.UTC);
            } catch (java.time.format.DateTimeParseException e) {
                continue;
            }
            if (timestamp.isAfter(now)) continue;
            var reading = new SmogReading();
            reading.timestamp = timestamp;
            reading.areaId = areaId;
            reading.source = SOURCE;
            reading.aqi = MonitoringService.value(hourly, "us_aqi", index);
            reading.pm25 = MonitoringService.value(hourly, "pm2_5", index);
            reading.pm10 = MonitoringService.value(hourly, "pm10", index);
            if (reading.aqi != null || reading.pm25 != null || reading.pm10 != null) {
                result.put(timestamp, reading);
            }
        }
        return result;
    }
}
