package pk.edu.nust.aeris;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

class OpenMeteoServiceTest {
    @Test void keepsRealValuesAndMissingFieldsWithoutStoringFutureForecasts() throws Exception {
        var payload = new ObjectMapper().readTree("""
            {"hourly": {
              "time": ["2026-11-24T05:00", "2026-11-24T06:00", "2026-11-24T07:00", "bad", "2026-11-24T08:00"],
              "us_aqi": [72, null, -1, 14, 85],
              "pm2_5": [12.5, 0, null, 8, 17],
              "pm10": [34, null, null, 30, 28]
            }}
            """);
        var readings = OpenMeteoService.parse(payload, 5L, Instant.parse("2026-11-24T07:10:00Z"));
        assertEquals(2, readings.size());
        var first = readings.firstEntry().getValue();
        assertEquals(5L, first.areaId);
        assertEquals(72.0, first.aqi);
        assertEquals(12.5, first.pm25);
        assertEquals(34.0, first.pm10);
        assertEquals(OpenMeteoService.SOURCE, first.source);
        var partial = readings.lastEntry().getValue();
        assertNull(partial.aqi);
        assertEquals(0.0, partial.pm25);
        assertNull(partial.pm10);
    }
}
