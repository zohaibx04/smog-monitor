package pk.edu.nust.aeris;

import javax.sql.DataSource;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="AERIS_POSTGRES_TEST_URL", matches=".*[/]smog_test")
@SpringBootTest(properties={"aeris.initial-delay=99999999","spring.jpa.hibernate.ddl-auto=validate"})
@Transactional
class PostgresIntegrationTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",()->System.getenv("AERIS_POSTGRES_TEST_URL"));
    }
    @Autowired DataSource dataSource;
    @Autowired AreaRepository areas;
    @Autowired ReadingRepository readings;
    @Autowired jakarta.persistence.EntityManager entityManager;
    @Autowired PreferenceRepository preferences;
    @Autowired AlertRepository alerts;
    @Autowired MonitoringService service;
    @Test void usesPostgresAndRoundTripsTimestampAndValues() throws Exception {
        try(var c=dataSource.getConnection()) {assertEquals("PostgreSQL",c.getMetaData().getDatabaseProductName());}
        var area=areas.saveAndFlush(new MonitoredArea("Postgres persistence check",52.52,13.41));
        var reading=new SmogReading();reading.areaId=area.id;reading.aqi=42.5;reading.pm25=8.25;reading.pm10=12.0;
        reading.source=OpenMeteoService.SOURCE;reading.timestamp=Instant.parse("2026-11-02T10:20:30.123456Z");
        readings.saveAndFlush(reading);
        try(var c=dataSource.getConnection();var s=c.prepareStatement("SELECT data_type FROM information_schema.columns WHERE table_name='smog_reading' AND column_name='timestamp'");var r=s.executeQuery()) {
            assertTrue(r.next());assertEquals("timestamp with time zone",r.getString(1));
        }
        entityManager.clear();
        var found=readings.findById(reading.id).orElseThrow();assertEquals(reading.timestamp,found.timestamp);assertEquals(42.5,found.aqi);
    }
    @Test void rejectsDuplicateReadings() {
        var area=areas.saveAndFlush(new MonitoredArea("Duplicate check",0,0));
        var first=new SmogReading();first.areaId=area.id;first.source="test";first.timestamp=Instant.parse("2026-11-02T00:00:00Z");readings.saveAndFlush(first);
        var duplicate=new SmogReading();duplicate.areaId=area.id;duplicate.source=first.source;duplicate.timestamp=first.timestamp;
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->readings.saveAndFlush(duplicate));
    }
    @Test void removingLocationRetainsHistoryAndResolvesItsAlert() {
        var area=areas.saveAndFlush(new MonitoredArea("Archive check",0,0));
        var reading=new SmogReading();reading.areaId=area.id;reading.source="test";reading.timestamp=Instant.now();readings.saveAndFlush(reading);
        var preference=new AlertPreference();preference.areaId=area.id;preference.aqiThreshold=100;preferences.saveAndFlush(preference);
        var alert=new SmogAlert();alert.areaId=area.id;alert.preferenceId=preference.id;alert.readingId=reading.id;alert.createdAt=Instant.now();
        alert.status="Active";alerts.saveAndFlush(alert);
        service.archiveArea(area);entityManager.flush();entityManager.clear();
        assertTrue(areas.findById(area.id).orElseThrow().archived);
        assertTrue(readings.existsById(reading.id));
        assertTrue(preferences.existsById(preference.id));
        assertEquals("Resolved",alerts.findById(alert.id).orElseThrow().status);
    }
}
