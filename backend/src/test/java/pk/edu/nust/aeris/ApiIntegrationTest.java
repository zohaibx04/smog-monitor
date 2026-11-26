package pk.edu.nust.aeris;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1", "spring.datasource.username=sa", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=create-drop", "aeris.admin-token=test-admin-token", "aeris.initial-delay=99999999"})
@AutoConfigureMockMvc
@org.springframework.transaction.annotation.Transactional
class ApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ReadingRepository readings;
    @Autowired AreaRepository areas;
    @Autowired AlertRepository alerts;
    @Autowired NetworkInitializer initializer;
    @MockitoBean OpenMeteoService openMeteo;
    @Test void archivedProviderReadingsAreExcludedFromLiveDataAndHistory() throws Exception {
        var r=new SmogReading();r.areaId=1L;r.aqi=120.0;r.timestamp=java.time.Instant.now().minusSeconds(60);
        r.source="Open-Meteo / CAMS model estimate";readings.saveAndFlush(r);
        var archived=new SmogReading();archived.areaId=1L;archived.aqi=66.0;
        archived.source="Archived provider";archived.timestamp=r.timestamp.plusSeconds(1);
        readings.saveAndFlush(archived);
        mvc.perform(get("/api/areas")).andExpect(jsonPath("$[0].reading.aqi").value(120.0));
        mvc.perform(get("/api/areas/1/history")).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].aqi").value(120.0));
    }
    @Test void locationDiscoveryRejectsInvalidSearchesAndCoordinates() throws Exception {
        mvc.perform(get("/api/locations/search?q=a")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/locations/search?q=London&country=invalid")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/locations/preview?latitude=100&longitude=20")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/locations/preview?latitude=NaN&longitude=20")).andExpect(status().isBadRequest());
    }
    @Test void defaultNetworkUsesFivePakistanCities() throws Exception {
        mvc.perform(get("/api/areas")).andExpect(status().isOk())
            .andExpect(jsonPath("$[0].area.name").value("Karachi, Pakistan"))
            .andExpect(jsonPath("$[0].area.latitude").value(24.8607))
            .andExpect(jsonPath("$[0].area.longitude").value(67.0011));
    }
    @Test void startupAddsLahoreWhenOnlyItsLegacyArchiveExistsAndClosesOrphanedAlert() throws Exception {
        var lahore = areas.findByArchivedFalseOrderByIdAsc().stream()
            .filter(city -> city.name.equals("Lahore, Pakistan")).findFirst().orElseThrow();
        lahore.name = "Lahore";
        lahore.active = false;
        lahore.archived = true;
        areas.save(lahore);

        var orphan = new SmogAlert();
        orphan.areaId = 1L;
        orphan.preferenceId = Long.MAX_VALUE;
        orphan.status = "Acknowledged";
        orphan.createdAt = java.time.Instant.now();
        var alertId = alerts.save(orphan).id;
        initializer.run(null);
        initializer.run(null);

        var locations = areas.findByArchivedFalseOrderByIdAsc();
        org.junit.jupiter.api.Assertions.assertEquals(5, locations.size());
        org.junit.jupiter.api.Assertions.assertTrue(locations.stream().anyMatch(city -> city.name.equals("Lahore, Pakistan")));
        org.junit.jupiter.api.Assertions.assertTrue(areas.findById(lahore.id).orElseThrow().archived);
        org.junit.jupiter.api.Assertions.assertEquals("Resolved", alerts.findById(alertId).orElseThrow().status);
    }

    @Test void pausingAnAreaResolvesItsOpenAlert() throws Exception {
        var reading = new SmogReading();
        reading.areaId = 1L;
        reading.aqi = 175.0;
        reading.source = OpenMeteoService.SOURCE;
        reading.timestamp = java.time.Instant.now().minusSeconds(60);
        readings.saveAndFlush(reading);
        mvc.perform(post("/api/preferences").contentType(MediaType.APPLICATION_JSON)
            .content("{\"areaId\":1,\"aqiThreshold\":100,\"enabled\":true}")).andExpect(status().isOk());
        mvc.perform(put("/api/admin/areas/1").header("X-Admin-Token","test-admin-token").contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Karachi\",\"latitude\":24.8607,\"longitude\":67.0011,\"active\":false}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        mvc.perform(get("/api/alerts")).andExpect(jsonPath("$[*].status", org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("Resolved"))));
    }
    @Test void originalDefaultsAreArchivedWithoutRelabellingTheirReadings() throws Exception {
        var old=areas.save(new MonitoredArea("Rawalpindi",33.6007,73.0679));
        var r=new SmogReading();r.areaId=old.id;r.aqi=123.0;r.timestamp=java.time.Instant.now().minusSeconds(120);
        r.source="Open-Meteo / CAMS model estimate";readings.save(r);
        initializer.run(null);initializer.run(null);
        org.junit.jupiter.api.Assertions.assertTrue(areas.findById(old.id).orElseThrow().archived);
        org.junit.jupiter.api.Assertions.assertEquals(5,areas.findByArchivedFalseOrderByIdAsc().size());
        org.junit.jupiter.api.Assertions.assertTrue(readings.existsById(r.id));
        org.junit.jupiter.api.Assertions.assertEquals(old.id,readings.findById(r.id).orElseThrow().areaId);
        mvc.perform(get("/api/areas/"+old.id+"/history")).andExpect(status().isNotFound());
    }
    @Test void administratorRulesRequireAuthorizationForEveryMutation() throws Exception {
        String input="{\"areaId\":1,\"aqiThreshold\":100,\"enabled\":true}";
        mvc.perform(post("/api/admin/preferences").contentType(MediaType.APPLICATION_JSON).content(input)).andExpect(status().isUnauthorized());
        String body=mvc.perform(post("/api/admin/preferences").header("X-Admin-Token","test-admin-token")
            .contentType(MediaType.APPLICATION_JSON).content(input)).andExpect(status().isOk())
            .andExpect(jsonPath("$.systemRule").value(true)).andReturn().getResponse().getContentAsString();
        long id=new com.fasterxml.jackson.databind.ObjectMapper().readTree(body).get("id").asLong();
        mvc.perform(put("/api/preferences/"+id).contentType(MediaType.APPLICATION_JSON).content(input)).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/preferences/"+id)).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/preferences/"+id).header("X-Admin-Token","test-admin-token")
            .contentType(MediaType.APPLICATION_JSON).content(input.replace("100","150"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.aqiThreshold").value(150));
        mvc.perform(delete("/api/preferences/"+id).header("X-Admin-Token","test-admin-token")).andExpect(status().isOk());
    }
    @Test void locationsExposeMissingDataHonestly() throws Exception {
        mvc.perform(get("/api/areas")).andExpect(status().isOk()).andExpect(jsonPath("$[0].stale").value(true));
    }
    @Test void liveModeRejectsSyntheticReadings() throws Exception {
        mvc.perform(post("/api/demo/areas/1/readings").contentType(MediaType.APPLICATION_JSON)
            .content("{\"aqi\":175}")).andExpect(status().isNotFound());
    }
    @Test void acknowledgingResolvedAlertCannotReopenIt() throws Exception {
        var alert=new SmogAlert();alert.areaId=1L;alert.status="Resolved";alert.createdAt=java.time.Instant.now();
        alert=alerts.saveAndFlush(alert);
        mvc.perform(patch("/api/alerts/"+alert.id)).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("Resolved"));
    }
    @Test void historyIncludesOnlySelectedLocationAndRequestedPeriod() throws Exception {
        var now=java.time.Instant.now();
        for(int i=0;i<3;i++) {
            var reading=new SmogReading();reading.areaId=i==2?2L:1L;reading.aqi=50.0+i;
            reading.source=OpenMeteoService.SOURCE;reading.timestamp=now.minusSeconds(i==1?172800:3600);
            readings.saveAndFlush(reading);
        }
        mvc.perform(get("/api/areas/1/history?hours=24")).andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].aqi").value(50.0));
        mvc.perform(get("/api/areas/1/history?hours=168")).andExpect(jsonPath("$.length()").value(2));
    }
    @Test void administrationRequiresToken() throws Exception {
        mvc.perform(post("/api/admin/areas").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Test\",\"latitude\":33.6,\"longitude\":73,\"active\":true}"))
            .andExpect(status().isUnauthorized());
    }
    @Test void publicLocationIsAddedWithoutATokenAndSurvivesStartup() throws Exception {
        var legacy = new MonitoredArea("Rawalpindi", 33.6, 73.04);
        legacy.active = false;
        legacy.archived = true;
        areas.saveAndFlush(legacy);
        String input = """
            {"name":"Rawalpindi, Pakistan","latitude":33.6,"longitude":73.04,"active":false}
            """;
        var response = mvc.perform(post("/api/areas").contentType(MediaType.APPLICATION_JSON).content(input))
            .andExpect(status().isOk()).andExpect(jsonPath("$.added").value(true))
            .andExpect(jsonPath("$.area.active").value(true)).andReturn().getResponse().getContentAsString();
        var id = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response).path("area").path("id").asLong();
        initializer.run(null);
        mvc.perform(get("/api/areas")).andExpect(jsonPath("$.length()").value(6));
        mvc.perform(get("/api/areas/" + id + "/history")).andExpect(status().isOk());
        mvc.perform(post("/api/areas").contentType(MediaType.APPLICATION_JSON).content(input))
            .andExpect(status().isOk()).andExpect(jsonPath("$.added").value(false))
            .andExpect(jsonPath("$.area.id").value(id));
        mvc.perform(post("/api/areas").contentType(MediaType.APPLICATION_JSON).content(input.replace("73.04", "73.05")))
            .andExpect(status().isConflict());
        org.mockito.Mockito.verify(openMeteo).refresh(org.mockito.ArgumentMatchers.any(MonitoredArea.class));
        mvc.perform(delete("/api/admin/areas/" + id)).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/admin/areas/" + id).header("X-Admin-Token", "test-admin-token"))
            .andExpect(status().isOk());
        mvc.perform(post("/api/areas").contentType(MediaType.APPLICATION_JSON).content(input))
            .andExpect(status().isConflict());
    }
    @Test void publicLocationRequiresValidCoordinates() throws Exception {
        mvc.perform(post("/api/areas").contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"New location\",\"longitude\":73.04}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/areas").contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"New location\",\"latitude\":91,\"longitude\":73.04}")).andExpect(status().isBadRequest());
    }
    @Test void coordinatesAndThresholdsAreValidated() throws Exception {
        mvc.perform(post("/api/admin/areas").header("X-Admin-Token","test-admin-token").contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Test\",\"latitude\":100,\"longitude\":73,\"active\":true}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/preferences").contentType(MediaType.APPLICATION_JSON).content("{\"areaId\":1,\"aqiThreshold\":0,\"enabled\":true}"))
            .andExpect(status().isBadRequest());
    }
    @Test void historyRejectsInvalidRanges() throws Exception {
        mvc.perform(get("/api/areas/1/history?hours=-1")).andExpect(status().isBadRequest());
    }
    @Test void administratorCannotExceedFiveCities() throws Exception {
        mvc.perform(post("/api/admin/areas").header("X-Admin-Token","test-admin-token").contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Test location\",\"latitude\":33.6,\"longitude\":73,\"active\":true}"))
            .andExpect(status().isConflict());
    }
    @Test void administratorCanRemoveAndRestoreCityWithoutLosingHistory() throws Exception {
        var reading = new SmogReading();
        reading.areaId=1L;reading.source=OpenMeteoService.SOURCE;reading.aqi=120.0;
        reading.timestamp=java.time.Instant.now().minusSeconds(60);
        readings.saveAndFlush(reading);
        mvc.perform(delete("/api/admin/areas/1").header("X-Admin-Token","test-admin-token")).andExpect(status().isOk());
        initializer.run(null);
        mvc.perform(get("/api/areas")).andExpect(jsonPath("$.length()").value(4));
        mvc.perform(get("/api/areas/1/history")).andExpect(status().isNotFound());
        mvc.perform(post("/api/admin/areas").header("X-Admin-Token","test-admin-token").contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Karachi\",\"latitude\":24.8607,\"longitude\":67.0011,\"active\":true}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(1));
        mvc.perform(get("/api/areas/1/history")).andExpect(jsonPath("$[0].aqi").value(120.0));
    }
    @Test void savedPreferenceTriggersAlertAndRemovalResolvesIt() throws Exception {
        var r=new SmogReading();r.areaId=1L;r.aqi=150.0;r.pm25=40.0;r.timestamp=java.time.Instant.now().minusSeconds(60);
        r.source=OpenMeteoService.SOURCE;readings.save(r);
        String body=mvc.perform(post("/api/preferences").contentType(MediaType.APPLICATION_JSON)
            .content("{\"areaId\":1,\"aqiThreshold\":100,\"enabled\":true}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long id=new com.fasterxml.jackson.databind.ObjectMapper().readTree(body).get("id").asLong();
        mvc.perform(get("/api/alerts")).andExpect(status().isOk()).andExpect(jsonPath("$[0].status").value("Active"));
        mvc.perform(get("/api/areas/1/history?hours=24")).andExpect(status().isOk()).andExpect(jsonPath("$[0].aqi").value(150.0));
        mvc.perform(delete("/api/preferences/"+id)).andExpect(status().isOk());
        mvc.perform(get("/api/alerts")).andExpect(jsonPath("$[0].status").value("Resolved"));
    }
}
